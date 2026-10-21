"use server";

import { and, eq, gte, lte, ne, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { customerSites, customers, pmocDocuments } from "@/db/schema";
import { type ActionState, formValues, runAction, zodFieldErrors } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { addDays, addMonths } from "@/lib/dates";
import { formatDate } from "@/lib/format";

const STAFF = ["admin", "gestor"] as const;

const text = (max: number) =>
  z
    .string()
    .max(max, `Use no máximo ${max} caracteres.`)
    .nullable()
    .transform((v) => v || null);

const dates = {
  validFrom: z.iso.date("Informe a data de início da vigência."),
  validUntil: z.iso.date("Informe a data de término da vigência."),
};

const docSchema = z
  .object({
    customerId: z.uuid("Escolha o cliente."),
    siteId: z.uuid("Local inválido.").nullable(),
    responsibleName: z.string({ error: "Informe o responsável técnico." }).min(3, "Informe o nome do responsável técnico.").max(120),
    responsibleRegistry: text(60),
    artNumber: text(60),
    ...dates,
    notes: text(2000),
  })
  .refine((d) => d.validUntil > d.validFrom, { path: ["validUntil"], message: "O término precisa ser depois do início." })
  .refine((d) => d.validUntil <= addMonths(d.validFrom, 36), { path: ["validUntil"], message: "A vigência pode ter no máximo 3 anos." });

function read(fd: FormData) {
  const f = formValues(fd);
  return {
    customerId: f.str("customerId") ?? undefined,
    siteId: f.str("siteId"),
    responsibleName: f.str("responsibleName") ?? undefined,
    responsibleRegistry: f.str("responsibleRegistry"),
    artNumber: f.str("artNumber"),
    validFrom: f.str("validFrom") ?? undefined,
    validUntil: f.str("validUntil") ?? undefined,
    notes: f.str("notes"),
  };
}

function invalid(error: z.ZodError): ActionState {
  return { ok: false, error: "Confira os campos destacados.", fieldErrors: zodFieldErrors(error) };
}

/** Confere cliente e local e impede dois PMOCs com vigências sobrepostas para o mesmo local. */
async function validateTarget(
  d: { customerId: string; siteId: string | null; validFrom: string; validUntil: string },
  exceptId?: string,
): Promise<Record<string, string> | null> {
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, d.customerId), columns: { id: true } });
  if (!customer) return { customerId: "Cliente não encontrado. Atualize a página." };
  if (d.siteId) {
    const site = await db.query.customerSites.findFirst({
      where: and(eq(customerSites.id, d.siteId), eq(customerSites.customerId, d.customerId)),
      columns: { id: true },
    });
    if (!site) return { siteId: "Este local não pertence ao cliente escolhido." };
  }
  const where: SQL[] = [
    eq(pmocDocuments.customerId, d.customerId),
    lte(pmocDocuments.validFrom, d.validUntil),
    gte(pmocDocuments.validUntil, d.validFrom),
  ];
  if (exceptId) where.push(ne(pmocDocuments.id, exceptId));
  const overlapping = await db.query.pmocDocuments.findMany({ where: and(...where) });
  const clash = overlapping.find((o) => !o.siteId || !d.siteId || o.siteId === d.siteId);
  if (clash) {
    return {
      validFrom: `Já existe um PMOC deste local válido de ${formatDate(clash.validFrom)} a ${formatDate(clash.validUntil)}. Ajuste as datas ou use Renovar no documento existente.`,
    };
  }
  return null;
}

function refresh(id?: string) {
  revalidatePath("/admin/pmoc");
  if (id) {
    revalidatePath(`/admin/pmoc/${id}`);
    revalidatePath(`/pmoc/${id}/imprimir`);
  }
  revalidatePath("/portal", "layout");
}

export async function createPmoc(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const parsed = docSchema.safeParse(read(fd));
    if (!parsed.success) return invalid(parsed.error);
    const clash = await validateTarget(parsed.data);
    if (clash) return { ok: false, error: Object.values(clash)[0], fieldErrors: clash };
    const [doc] = await db.insert(pmocDocuments).values(parsed.data).returning({ id: pmocDocuments.id });
    refresh(doc.id);
    redirect(`/admin/pmoc/${doc.id}?criado=1`);
  });
}

export async function updatePmoc(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const existing = await db.query.pmocDocuments.findFirst({ where: eq(pmocDocuments.id, id), columns: { id: true } });
    if (!existing) throw new Error("Este PMOC não existe mais. Volte para a lista.");
    const parsed = docSchema.safeParse(read(fd));
    if (!parsed.success) return invalid(parsed.error);
    const clash = await validateTarget(parsed.data, id);
    if (clash) return { ok: false, error: Object.values(clash)[0], fieldErrors: clash };
    await db.update(pmocDocuments).set(parsed.data).where(eq(pmocDocuments.id, id));
    refresh(id);
    redirect(`/admin/pmoc/${id}?salvo=1`);
  });
}

const renewSchema = z
  .object({
    responsibleName: z.string({ error: "Informe o responsável técnico." }).min(3, "Informe o nome do responsável técnico.").max(120),
    responsibleRegistry: text(60),
    artNumber: z.string({ error: "Informe o número da nova ART." }).min(4, "Informe o número da nova ART.").max(60),
    ...dates,
  })
  .refine((d) => d.validUntil > d.validFrom, { path: ["validUntil"], message: "O término precisa ser depois do início." });

/** Renova: cria o documento do próximo período (nova ART), mantendo o anterior como histórico. */
export async function renewPmoc(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const current = await db.query.pmocDocuments.findFirst({ where: eq(pmocDocuments.id, id) });
    if (!current) throw new Error("Este PMOC não existe mais. Volte para a lista.");
    const f = formValues(fd);
    const parsed = renewSchema.safeParse({
      responsibleName: f.str("responsibleName") ?? undefined,
      responsibleRegistry: f.str("responsibleRegistry"),
      artNumber: f.str("artNumber") ?? undefined,
      validFrom: f.str("validFrom") ?? undefined,
      validUntil: f.str("validUntil") ?? undefined,
    });
    if (!parsed.success) return invalid(parsed.error);
    if (parsed.data.validFrom <= current.validFrom) {
      return {
        ok: false,
        error: "A renovação precisa começar depois do início do documento atual.",
        fieldErrors: { validFrom: `Use uma data depois de ${formatDate(current.validFrom)}.` },
      };
    }
    if (current.artNumber && parsed.data.artNumber.trim() === current.artNumber.trim()) {
      return {
        ok: false,
        error: "Cada período precisa de uma ART nova.",
        fieldErrors: { artNumber: "Este é o número da ART atual. Informe a ART do novo período." },
      };
    }
    // O documento atual termina na véspera do novo, se ainda estiver valendo além disso.
    const overlap = await validateTarget({ ...parsed.data, customerId: current.customerId, siteId: current.siteId }, id);
    if (overlap) return { ok: false, error: Object.values(overlap)[0], fieldErrors: overlap };

    const newId = await db.transaction(async (tx) => {
      if (current.validUntil >= parsed.data.validFrom) {
        await tx
          .update(pmocDocuments)
          .set({ validUntil: addDays(parsed.data.validFrom, -1) })
          .where(eq(pmocDocuments.id, id));
      }
      const [doc] = await tx
        .insert(pmocDocuments)
        .values({
          customerId: current.customerId,
          siteId: current.siteId,
          notes: current.notes,
          ...parsed.data,
        })
        .returning({ id: pmocDocuments.id });
      return doc.id;
    });
    refresh(id);
    refresh(newId);
    redirect(`/admin/pmoc/${newId}?renovado=1`);
  });
}

export async function deletePmoc(id: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(["admin"]);
    const deleted = await db.delete(pmocDocuments).where(eq(pmocDocuments.id, id)).returning({ id: pmocDocuments.id });
    if (!deleted.length) throw new Error("Este PMOC já foi excluído.");
    refresh(id);
    redirect("/admin/pmoc?excluido=1");
  });
}
