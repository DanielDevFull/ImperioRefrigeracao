"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bankAccounts, financeCategories, payables, suppliers } from "@/db/schema";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { addMonths, todayISO } from "@/lib/dates";
import { MAX_UPLOAD_BYTES, storeFile } from "@/lib/storage";
import { MAX_UPLOAD_LABEL } from "@/lib/upload";
import { payPayable } from "@/server/billing";
import { PAYMENT_METHOD_VALUES } from "../_lib/constants";

const STAFF = ["admin", "gestor"] as const;
const done = () => {
  revalidatePath("/admin/financeiro", "layout");
  revalidatePath("/admin/comissoes");
};

const isoDate = (msg: string) => z.string({ error: msg }).regex(/^\d{4}-\d{2}-\d{2}$/, msg);

/* ---------------------------------- Pagar --------------------------------- */

const paySchema = z.object({
  id: z.uuid("Conta inválida. Recarregue a página."),
  paidOn: isoDate("Informe a data do pagamento.").refine((d) => d <= todayISO(), "A data do pagamento não pode estar no futuro."),
  method: z.enum(PAYMENT_METHOD_VALUES, { error: "Escolha a forma de pagamento." }),
  bankAccountId: z.uuid("Conta bancária inválida.").nullable(),
  paidAmount: z
    .number({ error: "Informe o valor pago." })
    .positive("O valor pago precisa ser maior que zero.")
    .max(10_000_000, "Valor fora do limite."),
});

export async function payPayableAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const v = formValues(fd);
    const parsed = paySchema.safeParse({
      id: v.str("id"),
      paidOn: v.str("paidOn"),
      method: v.str("method"),
      bankAccountId: v.str("bankAccountId"),
      paidAmount: v.money("paidAmount"),
    });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const d = parsed.data;
    await db.transaction(async (tx) => {
      if (d.bankAccountId) {
        const acc = await tx.query.bankAccounts.findFirst({ where: eq(bankAccounts.id, d.bankAccountId) });
        if (!acc) throw new Error("Conta bancária não encontrada. Escolha outra.");
      }
      await payPayable(tx, d.id, {
        paidOn: d.paidOn,
        paidAmount: d.paidAmount,
        method: d.method,
        bankAccountId: d.bankAccountId,
      });
    });
    done();
    return { ok: true, message: "Pagamento registrado" };
  });
}

/* --------------------------------- Cancelar -------------------------------- */

export async function cancelPayable(id: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) throw new Error("Conta inválida. Recarregue a página.");
    await db.transaction(async (tx) => {
      const p = await tx.query.payables.findFirst({ where: eq(payables.id, parsed.data) });
      if (!p) throw new Error("Conta não encontrada. Recarregue a página.");
      if (p.status !== "aberto") throw new Error("Só é possível cancelar contas em aberto.");
      if (p.commissionPayoutId)
        throw new Error("Esta conta é o fechamento de uma comissão. Para desfazer, ajuste o fechamento em Comissões.");
      await tx.update(payables).set({ status: "cancelado" }).where(and(eq(payables.id, p.id), eq(payables.status, "aberto")));
    });
    done();
    return { ok: true, message: "Conta cancelada" };
  });
}

/* ------------------------------- Nova conta ------------------------------- */

const createSchema = z
  .object({
    supplierId: z.uuid("Fornecedor inválido.").nullable(),
    categoryId: z.uuid("Escolha a categoria."),
    description: z
      .string({ error: "Descreva a despesa." })
      .trim()
      .min(3, "Descreva a despesa (mín. 3 caracteres).")
      .max(160, "Use no máximo 160 caracteres."),
    documentNumber: z.string().trim().max(60, "Use no máximo 60 caracteres.").nullable(),
    dueDate: isoDate("Informe o vencimento."),
    amount: z
      .number({ error: "Informe o valor." })
      .positive("O valor precisa ser maior que zero.")
      .max(10_000_000, "Valor fora do limite."),
    notes: z.string().trim().max(1000, "Use no máximo 1000 caracteres.").nullable(),
    repeat: z.boolean(),
    repeatMonths: z.number({ error: "Informe por quantos meses repetir." }).int("Use um número inteiro de meses.").nullable(),
  })
  .superRefine((d, ctx) => {
    if (d.repeat && (d.repeatMonths == null || d.repeatMonths < 2 || d.repeatMonths > 36))
      ctx.addIssue({ code: "custom", path: ["repeatMonths"], message: "Repita de 2 a 36 meses." });
  });

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export async function createPayable(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const v = formValues(fd);
    const parsed = createSchema.safeParse({
      supplierId: v.str("supplierId"),
      categoryId: v.str("categoryId"),
      description: v.str("description"),
      documentNumber: v.str("documentNumber"),
      dueDate: v.str("dueDate"),
      amount: v.money("amount"),
      notes: v.str("notes"),
      repeat: v.bool("repeat"),
      repeatMonths: v.num("repeatMonths"),
    });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const d = parsed.data;

    const file = fd.get("attachment");
    let attachmentUrl: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (!ACCEPTED.includes(file.type))
        return { ok: false, error: "Anexo inválido.", fieldErrors: { attachment: "Envie uma imagem (JPG, PNG, WEBP) ou um PDF." } };
      if (file.size > MAX_UPLOAD_BYTES)
        return { ok: false, error: "Anexo muito grande.", fieldErrors: { attachment: `O arquivo passa de ${MAX_UPLOAD_LABEL}. Envie uma versão menor.` } };
    }

    const [cat, sup] = await Promise.all([
      db.query.financeCategories.findFirst({
        where: and(eq(financeCategories.id, d.categoryId), eq(financeCategories.type, "despesa")),
      }),
      d.supplierId ? db.query.suppliers.findFirst({ where: eq(suppliers.id, d.supplierId), columns: { id: true } }) : null,
    ]);
    if (!cat) throw new Error("Categoria de despesa não encontrada. Escolha outra.");
    if (d.supplierId && !sup) throw new Error("Fornecedor não encontrado. Escolha outro.");

    if (file instanceof File && file.size > 0) attachmentUrl = await storeFile("anexos", file, file.name);

    const n = d.repeat ? (d.repeatMonths ?? 1) : 1;
    const anchorDay = Number(d.dueDate.slice(8, 10));
    const created = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(payables)
        .values(
          Array.from({ length: n }, (_, i) => ({
            supplierId: d.supplierId,
            categoryId: d.categoryId,
            description: n > 1 ? `${d.description} (${i + 1}/${n})` : d.description,
            documentNumber: d.documentNumber,
            dueDate: addMonths(d.dueDate, i, anchorDay),
            amount: d.amount,
            attachmentUrl,
            notes: d.notes,
          })),
        )
        .returning({ id: payables.id });
      return rows.length;
    });
    done();
    return { ok: true, message: created > 1 ? `${created} contas a pagar criadas` : "Conta a pagar criada" };
  });
}
