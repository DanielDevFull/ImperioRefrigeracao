"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bankAccounts, financeCategories } from "@/db/schema";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { CATEGORY_SWATCHES } from "./_lib/constants";

const STAFF = ["admin", "gestor"] as const;
const swatchValues = CATEGORY_SWATCHES.map((s) => s.value) as [string, ...string[]];

const done = () => revalidatePath("/admin/financeiro", "layout");

/* ------------------------------ Categorias ------------------------------ */

const categorySchema = z.object({
  name: z.string({ error: "Informe o nome da categoria." }).trim().min(2, "Use pelo menos 2 letras.").max(60, "Use no máximo 60 caracteres."),
  type: z.enum(["receita", "despesa"], { error: "Escolha se é receita ou despesa." }),
  color: z.enum(swatchValues, { error: "Escolha uma das cores." }),
});

async function assertUniqueCategory(name: string, type: "receita" | "despesa", exceptId?: string) {
  const clash = await db.query.financeCategories.findFirst({
    where: and(
      sql`lower(${financeCategories.name}) = lower(${name})`,
      eq(financeCategories.type, type),
      exceptId ? ne(financeCategories.id, exceptId) : undefined,
    ),
  });
  if (clash) throw new Error(`Já existe a categoria de ${type} "${clash.name}". Use outro nome.`);
}

export async function createCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const v = formValues(fd);
    const parsed = categorySchema.safeParse({ name: v.str("name"), type: v.str("type"), color: v.str("color") });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    await assertUniqueCategory(parsed.data.name, parsed.data.type);
    const [c] = await db.insert(financeCategories).values(parsed.data).returning();
    done();
    return { ok: true, message: "Categoria criada", id: c.id };
  });
}

const updateCategorySchema = z.object({
  id: z.uuid("Categoria inválida."),
  name: categorySchema.shape.name,
  color: categorySchema.shape.color,
});

export async function updateCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const v = formValues(fd);
    const parsed = updateCategorySchema.safeParse({ id: v.str("id"), name: v.str("name"), color: v.str("color") });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const current = await db.query.financeCategories.findFirst({ where: eq(financeCategories.id, parsed.data.id) });
    if (!current) throw new Error("Categoria não encontrada. Recarregue a página.");
    await assertUniqueCategory(parsed.data.name, current.type, current.id);
    await db
      .update(financeCategories)
      .set({ name: parsed.data.name, color: parsed.data.color })
      .where(eq(financeCategories.id, parsed.data.id));
    done();
    return { ok: true, message: "Categoria salva" };
  });
}

export async function setCategoryActive(id: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const parsed = z.object({ id: z.uuid(), active: z.boolean() }).safeParse({ id, active });
    if (!parsed.success) throw new Error("Categoria inválida.");
    const [c] = await db
      .update(financeCategories)
      .set({ active: parsed.data.active })
      .where(eq(financeCategories.id, parsed.data.id))
      .returning();
    if (!c) throw new Error("Categoria não encontrada. Recarregue a página.");
    done();
    return { ok: true, message: active ? "Categoria reativada" : "Categoria desativada" };
  });
}

/* ---------------------------- Contas bancárias --------------------------- */

const accountSchema = z.object({
  name: z.string({ error: "Informe o nome da conta." }).trim().min(2, "Use pelo menos 2 letras.").max(60, "Use no máximo 60 caracteres."),
  initialBalance: z
    .number({ error: "Informe o saldo inicial (pode ser 0,00)." })
    .min(-10_000_000, "Valor fora do limite.")
    .max(10_000_000, "Valor fora do limite."),
});

export async function createBankAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const v = formValues(fd);
    const parsed = accountSchema.safeParse({ name: v.str("name"), initialBalance: v.money("initialBalance") ?? 0 });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const [a] = await db.insert(bankAccounts).values(parsed.data).returning();
    done();
    return { ok: true, message: "Conta criada", id: a.id };
  });
}

export async function updateBankAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const v = formValues(fd);
    const parsed = accountSchema
      .extend({ id: z.uuid("Conta inválida.") })
      .safeParse({ id: v.str("id"), name: v.str("name"), initialBalance: v.money("initialBalance") ?? 0 });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const [a] = await db
      .update(bankAccounts)
      .set({ name: parsed.data.name, initialBalance: parsed.data.initialBalance })
      .where(eq(bankAccounts.id, parsed.data.id))
      .returning();
    if (!a) throw new Error("Conta não encontrada. Recarregue a página.");
    done();
    return { ok: true, message: "Conta salva" };
  });
}

export async function setBankAccountActive(id: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const parsed = z.object({ id: z.uuid(), active: z.boolean() }).safeParse({ id, active });
    if (!parsed.success) throw new Error("Conta inválida.");
    if (!parsed.data.active) {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.active, true), ne(bankAccounts.id, parsed.data.id)));
      if (n === 0) throw new Error("Mantenha pelo menos uma conta ativa para registrar pagamentos.");
    }
    const [a] = await db
      .update(bankAccounts)
      .set({ active: parsed.data.active })
      .where(eq(bankAccounts.id, parsed.data.id))
      .returning();
    if (!a) throw new Error("Conta não encontrada. Recarregue a página.");
    done();
    return { ok: true, message: active ? "Conta reativada" : "Conta desativada" };
  });
}
