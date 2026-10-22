"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { normalizeDocument, normalizePhone } from "@/lib/format";
import { cpfOrCnpjError } from "../clientes/_lib/document";

const STAFF = ["admin", "gestor"] as const;

const supplierSchema = z.object({
  name: z.string({ error: "Informe o nome do fornecedor." }).min(2, "Informe o nome do fornecedor."),
  document: z
    .string()
    .refine((d) => /^\d{11}$/.test(d) || /^[0-9A-Z]{12}\d{2}$/.test(d), "CNPJ (14 caracteres) ou CPF (11 dígitos) incompleto.")
    .nullable(),
  contactName: z.string().nullable(),
  phone: z
    .string()
    .refine((d) => d.length === 10 || d.length === 11, "Telefone com DDD: 10 ou 11 dígitos.")
    .nullable(),
  email: z.email("E-mail inválido.").nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
});

function revalidateSuppliers(id?: string) {
  revalidatePath("/admin/fornecedores");
  if (id) revalidatePath(`/admin/fornecedores/${id}`);
  revalidatePath("/admin/compras");
  revalidatePath("/admin/estoque");
}

export async function saveSupplier(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole([...STAFF]);
  const v = formValues(fd);
  const id = v.str("id");
  // CNPJ pode ser alfanumérico: mantém as letras (em maiúsculas); telefone sem o +55
  const doc = normalizeDocument(v.str("document"));
  const phone = normalizePhone(v.str("phone"));
  const parsed = supplierSchema.safeParse({
    name: v.str("name") ?? "",
    document: doc || null,
    contactName: v.str("contactName"),
    phone: phone || null,
    email: v.str("email")?.toLowerCase() ?? null,
    notes: v.str("notes"),
    active: id ? v.bool("active") : true,
  });
  if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  if (d.document) {
    // dígitos verificadores: só quando o documento mudou (cadastros antigos podem ter números sem DV válido)
    const current = id
      ? await db.query.suppliers.findFirst({ where: eq(suppliers.id, id), columns: { document: true } })
      : undefined;
    if (normalizeDocument(current?.document) !== d.document) {
      const err = cpfOrCnpjError(d.document);
      if (err) return { ok: false, error: "Revise os campos destacados.", fieldErrors: { document: err } };
    }
    const dup = await db.query.suppliers.findFirst({
      where: and(
        sql`regexp_replace(upper(coalesce(${suppliers.document}, '')), '[^0-9A-Z]', '', 'g') = ${d.document}`,
        id ? ne(suppliers.id, id) : undefined,
      ),
      columns: { id: true, name: true },
    });
    if (dup)
      return {
        ok: false,
        error: "Revise os campos destacados.",
        fieldErrors: { document: `Este documento já está no cadastro de "${dup.name}".` },
      };
  }
  return runAction(async () => {
    let savedId = id;
    if (id) {
      const [row] = await db.update(suppliers).set(d).where(eq(suppliers.id, id)).returning({ id: suppliers.id });
      if (!row) throw new Error("Fornecedor não encontrado. Ele pode ter sido removido.");
    } else {
      const [row] = await db.insert(suppliers).values(d).returning({ id: suppliers.id });
      savedId = row.id;
    }
    revalidateSuppliers(savedId ?? undefined);
    return { ok: true, message: id ? "Fornecedor salvo" : "Fornecedor cadastrado", id: savedId ?? undefined };
  });
}

export async function setSupplierActive(id: string, active: boolean): Promise<ActionState> {
  await assertRole([...STAFF]);
  return runAction(async () => {
    const [row] = await db.update(suppliers).set({ active }).where(eq(suppliers.id, id)).returning({ id: suppliers.id });
    if (!row) throw new Error("Fornecedor não encontrado.");
    revalidateSuppliers(id);
    return { ok: true, message: active ? "Fornecedor reativado" : "Fornecedor desativado" };
  });
}
