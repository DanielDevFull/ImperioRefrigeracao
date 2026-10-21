"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bankAccounts, customers, financeCategories, receivables } from "@/db/schema";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { txidFor } from "@/lib/pix";
import { confirmReceivable, generateInvoices, rejectProof } from "@/server/billing";
import { PAYMENT_METHOD_VALUES } from "../_lib/constants";

const STAFF = ["admin", "gestor"] as const;
const done = () => {
  revalidatePath("/admin/financeiro", "layout");
  revalidatePath("/portal", "layout");
};

const isoDate = (msg: string) => z.string({ error: msg }).regex(/^\d{4}-\d{2}-\d{2}$/, msg);

/* -------------------------- Confirmar pagamento -------------------------- */

const confirmSchema = z.object({
  id: z.uuid("Conta inválida. Recarregue a página."),
  paidOn: isoDate("Informe a data do pagamento.").refine((d) => d <= todayISO(), "A data do pagamento não pode estar no futuro."),
  method: z.enum(PAYMENT_METHOD_VALUES, { error: "Escolha a forma de pagamento." }),
  bankAccountId: z.uuid("Conta bancária inválida.").nullable(),
  paidAmount: z
    .number({ error: "Informe o valor recebido." })
    .positive("O valor recebido precisa ser maior que zero.")
    .max(10_000_000, "Valor fora do limite."),
  waiveLateFees: z.boolean(),
});

export async function confirmReceivableAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    const v = formValues(fd);
    const parsed = confirmSchema.safeParse({
      id: v.str("id"),
      paidOn: v.str("paidOn"),
      method: v.str("method"),
      bankAccountId: v.str("bankAccountId"),
      paidAmount: v.money("paidAmount"),
      waiveLateFees: v.bool("waiveLateFees"),
    });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const d = parsed.data;
    await db.transaction(async (tx) => {
      if (d.bankAccountId) {
        const acc = await tx.query.bankAccounts.findFirst({ where: eq(bankAccounts.id, d.bankAccountId) });
        if (!acc) throw new Error("Conta bancária não encontrada. Escolha outra.");
      }
      await confirmReceivable(tx, d.id, {
        paidOn: d.paidOn,
        paidAmount: d.paidAmount,
        method: d.method,
        bankAccountId: d.bankAccountId,
        waiveLateFees: d.waiveLateFees,
        userId: user.id,
      });
    });
    done();
    return { ok: true, message: "Pagamento confirmado" };
  });
}

/* --------------------------- Recusar comprovante -------------------------- */

const rejectSchema = z.object({
  id: z.uuid("Conta inválida. Recarregue a página."),
  reason: z
    .string({ error: "Explique o motivo para o cliente." })
    .trim()
    .min(8, "Explique o motivo em uma frase (mín. 8 caracteres).")
    .max(300, "Use no máximo 300 caracteres."),
});

export async function rejectProofAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const v = formValues(fd);
    const parsed = rejectSchema.safeParse({ id: v.str("id"), reason: v.str("reason") });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    await db.transaction(async (tx) => {
      await rejectProof(tx, parsed.data.id, parsed.data.reason);
    });
    done();
    return { ok: true, message: "Comprovante recusado. O cliente foi avisado." };
  });
}

/* --------------------------------- Cancelar -------------------------------- */

export async function cancelReceivable(id: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) throw new Error("Conta inválida. Recarregue a página.");
    await db.transaction(async (tx) => {
      const rec = await tx.query.receivables.findFirst({ where: eq(receivables.id, parsed.data) });
      if (!rec) throw new Error("Conta não encontrada. Recarregue a página.");
      if (rec.status === "pago") throw new Error("Esta conta já foi paga e não pode ser cancelada.");
      if (rec.status === "cancelado") throw new Error("Esta conta já está cancelada.");
      await tx
        .update(receivables)
        .set({ status: "cancelado" })
        .where(and(eq(receivables.id, rec.id), inArray(receivables.status, ["aberto", "em_analise"])));
    });
    done();
    return { ok: true, message: "Conta cancelada" };
  });
}

/* ------------------------------ Nova conta ------------------------------- */

const createSchema = z.object({
  customerId: z.uuid("Cliente inválido.").nullable(),
  categoryId: z.uuid("Escolha a categoria."),
  kind: z.enum(["servico", "outro"], { error: "Escolha o tipo." }),
  description: z
    .string({ error: "Descreva a cobrança." })
    .trim()
    .min(3, "Descreva a cobrança (mín. 3 caracteres).")
    .max(160, "Use no máximo 160 caracteres."),
  dueDate: isoDate("Informe o vencimento."),
  amount: z
    .number({ error: "Informe o valor." })
    .positive("O valor precisa ser maior que zero.")
    .max(10_000_000, "Valor fora do limite."),
  notes: z.string().trim().max(1000, "Use no máximo 1000 caracteres.").nullable(),
});

export async function createReceivable(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const v = formValues(fd);
    const parsed = createSchema.safeParse({
      customerId: v.str("customerId"),
      categoryId: v.str("categoryId"),
      kind: v.str("kind") ?? "outro",
      description: v.str("description"),
      dueDate: v.str("dueDate"),
      amount: v.money("amount"),
      notes: v.str("notes"),
    });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const d = parsed.data;
    const id = await db.transaction(async (tx) => {
      const cat = await tx.query.financeCategories.findFirst({
        where: and(eq(financeCategories.id, d.categoryId), eq(financeCategories.type, "receita")),
      });
      if (!cat) throw new Error("Categoria de receita não encontrada. Escolha outra.");
      if (d.customerId) {
        const c = await tx.query.customers.findFirst({ where: eq(customers.id, d.customerId), columns: { id: true } });
        if (!c) throw new Error("Cliente não encontrado. Escolha outro.");
      }
      const [rec] = await tx
        .insert(receivables)
        .values({
          customerId: d.customerId,
          categoryId: d.categoryId,
          kind: d.kind,
          description: d.description,
          dueDate: d.dueDate,
          amount: d.amount,
          notes: d.notes,
        })
        .returning();
      await tx.update(receivables).set({ pixTxid: txidFor(rec.id) }).where(eq(receivables.id, rec.id));
      return rec.id;
    });
    done();
    return { ok: true, message: "Conta a receber criada", id };
  });
}

/* --------------------------- Gerar mensalidades -------------------------- */

export async function generateInvoicesNow(): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const { created } = await generateInvoices();
    done();
    return {
      ok: true,
      message:
        created === 0
          ? "Nenhuma mensalidade nova: as do período já estavam geradas"
          : created === 1
            ? "1 mensalidade gerada"
            : `${created} mensalidades geradas`,
    };
  });
}
