"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/db";
import { customerSites, customers, products, quoteItems, quotes, technicians } from "@/db/schema";
import { type ActionState, formValues, runAction, zodFieldErrors } from "@/lib/action";
import { assertRole, type AppUser } from "@/lib/auth/session";
import { addDays, todayISO } from "@/lib/dates";
import { formatBRL, formatOM, normalizeDocument, normalizePhone, onlyDigits } from "@/lib/format";
import { discountFits, isQuoteOpen, quoteTotals } from "@/server/core/quotes";
import { approveQuote, rejectQuote } from "@/server/quotes";
import { getSettings } from "@/server/settings";
import type { Actor } from "@/server/work-orders";
import { documentError } from "../clientes/_lib/document";

const STAFF = ["admin", "gestor"] as const;
const actor = (u: AppUser): Actor => ({ userId: u.id });
const isUuid = (v: unknown): v is string => typeof v === "string" && z.uuid().safeParse(v).success;

function revalidateQuotes(id?: string) {
  revalidatePath("/admin/orcamentos");
  if (id) revalidatePath(`/admin/orcamentos/${id}`);
}

const optionalText = (max: number, label: string) => z.string().max(max, `${label}: use no máximo ${max} caracteres.`).nullable();

const itemSchema = z.object({
  kind: z.enum(["servico", "material"]),
  productId: z.uuid().nullable(),
  description: z.string({ error: "Descreva o item." }).trim().min(2, "Descreva o item.").max(300, "Descrição longa demais."),
  quantity: z.number({ error: "Informe a quantidade." }).positive("A quantidade precisa ser maior que zero.").max(99_999, "Quantidade alta demais."),
  unit: z.string().trim().min(1, "Informe a unidade.").max(12, "Unidade com até 12 letras."),
  unitPrice: z.number({ error: "Informe o valor." }).min(0, "O valor não pode ser negativo.").max(9_999_999, "Valor alto demais."),
});

const quoteSchema = z.object({
  customerId: z.uuid().nullable(),
  contactName: z.string({ error: "Informe o nome de quem pediu o orçamento." }).min(2, "Informe o nome de quem pediu o orçamento.").max(200),
  contactPersonType: z.enum(["pf", "pj"]),
  contactDocument: z.string().nullable(),
  contactPhone: z
    .string()
    .nullable()
    .refine((v) => !v || v.length === 10 || v.length === 11, "Telefone: informe DDD + número (10 ou 11 dígitos)."),
  contactEmail: z.email("E-mail inválido. Confira o endereço.").nullable(),
  zip: z
    .string()
    .nullable()
    .refine((v) => !v || v.length === 8, "CEP tem 8 dígitos."),
  street: optionalText(200, "Logradouro"),
  addressNumber: optionalText(30, "Número"),
  complement: optionalText(120, "Complemento"),
  district: optionalText(120, "Bairro"),
  city: optionalText(120, "Cidade"),
  state: z
    .string()
    .nullable()
    .refine((v) => !v || /^[A-Z]{2}$/.test(v), "UF com 2 letras (ex.: SP)."),
  workType: z.enum(["corretiva", "instalacao", "visita_tecnica", "preventiva", "pmoc"], { error: "Escolha o tipo de serviço." }),
  title: z.string({ error: "Dê um título ao orçamento." }).min(3, "Dê um título com pelo menos 3 letras.").max(160),
  description: optionalText(4000, "Descrição"),
  discount: z.number().min(0, "O desconto não pode ser negativo."),
  validUntil: z.string({ error: "Informe a validade." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a validade."),
  terms: optionalText(4000, "Condições"),
  items: z.array(itemSchema).min(1, "Adicione pelo menos um item.").max(100, "No máximo 100 itens."),
});

type ItemInput = z.infer<typeof itemSchema>;

function readItems(raw: string | null): unknown {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Cria ou atualiza o orçamento (itens enviados como JSON pelo editor). */
export async function saveQuote(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    const v = formValues(fd);
    const id = v.str("id");
    const personType = v.str("contactPersonType") === "pj" ? "pj" : "pf";
    const parsed = quoteSchema.safeParse({
      customerId: v.str("customerId"),
      contactName: v.str("contactName") ?? undefined,
      contactPersonType: personType,
      contactDocument: normalizeDocument(v.str("contactDocument")) || null,
      contactPhone: normalizePhone(v.str("contactPhone")) || null,
      contactEmail: v.str("contactEmail")?.toLowerCase() ?? null,
      zip: onlyDigits(v.str("zip")) || null,
      street: v.str("street"),
      addressNumber: v.str("addressNumber"),
      complement: v.str("complement"),
      district: v.str("district"),
      city: v.str("city"),
      state: v.str("state")?.toUpperCase() ?? null,
      workType: v.str("workType") ?? undefined,
      title: v.str("title") ?? undefined,
      description: v.str("description"),
      discount: v.money("discount") ?? 0,
      validUntil: v.str("validUntil") ?? undefined,
      terms: v.str("terms"),
      items: readItems(v.str("items")),
    });
    const fieldErrors: Record<string, string> = parsed.success ? {} : zodFieldErrors(parsed.error);

    let existing: typeof quotes.$inferSelect | undefined;
    if (id) {
      if (!isUuid(id)) return { ok: false, error: "Orçamento não encontrado." };
      existing = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
      if (!existing) return { ok: false, error: "Orçamento não encontrado. Ele pode ter sido excluído." };
      if (!isQuoteOpen(existing.status)) return { ok: false, error: "Só orçamentos em aberto podem ser editados." };
    }

    if (parsed.success) {
      const d = parsed.data;
      const docErr = documentError(d.contactPersonType, d.contactDocument);
      if (docErr) fieldErrors.contactDocument = docErr;
      if (d.customerId) {
        const c = await db.query.customers.findFirst({ where: eq(customers.id, d.customerId), columns: { id: true } });
        if (!c) fieldErrors.customerId = "Cliente não encontrado.";
      }
      // materiais: produto obrigatório e existente
      const productIds = [...new Set(d.items.filter((i) => i.kind === "material" && i.productId).map((i) => i.productId!))];
      const found = productIds.length
        ? await db.select({ id: products.id }).from(products).where(inArray(products.id, productIds))
        : [];
      const known = new Set(found.map((p) => p.id));
      d.items.forEach((it, i) => {
        if (it.kind === "material" && !it.productId) fieldErrors[`items.${i}.productId`] = "Escolha o produto do estoque.";
        else if (it.kind === "material" && !known.has(it.productId!)) fieldErrors[`items.${i}.productId`] = "Produto não encontrado.";
      });
      const totals = quoteTotals(normalizeItems(d.items), d.discount);
      if (!discountFits(totals)) {
        fieldErrors.discount = totals.services
          ? `O desconto sai da mão de obra: no máximo ${formatBRL(totals.services)}.`
          : "Sem serviços no orçamento não há mão de obra para descontar. Ajuste os valores dos materiais.";
      }
      if (!existing && d.validUntil < todayISO()) fieldErrors.validUntil = "A validade não pode ser antes de hoje.";
    }

    if (!parsed.success || Object.keys(fieldErrors).length) {
      const itemsError = Object.keys(fieldErrors).some((k) => k.startsWith("items"));
      return {
        ok: false,
        error: itemsError && Object.keys(fieldErrors).every((k) => k.startsWith("items")) ? "Revise os itens destacados." : "Revise os campos destacados.",
        fieldErrors,
      };
    }

    const d = parsed.data;
    const items = normalizeItems(d.items);
    const totals = quoteTotals(items, d.discount);
    const values = {
      customerId: d.customerId,
      contactName: d.contactName,
      contactPersonType: d.contactPersonType,
      contactDocument: d.contactDocument,
      contactPhone: d.contactPhone,
      contactEmail: d.contactEmail,
      zip: d.zip,
      street: d.street,
      addressNumber: d.addressNumber,
      complement: d.complement,
      district: d.district,
      city: d.city,
      state: d.state,
      workType: d.workType,
      title: d.title,
      description: d.description,
      discount: totals.discount,
      total: totals.total,
      validUntil: d.validUntil,
      terms: d.terms,
    };

    const quoteId = await db.transaction(async (tx) => {
      let qid: string;
      if (existing) {
        // trava contra aprovação simultânea pelo link
        const [locked] = await tx.select({ status: quotes.status }).from(quotes).where(eq(quotes.id, existing.id)).for("update");
        if (!locked || !isQuoteOpen(locked.status)) throw new Error("Este orçamento acabou de ser aprovado ou recusado. Atualize a página.");
        await tx.update(quotes).set(values).where(eq(quotes.id, existing.id));
        await tx.delete(quoteItems).where(eq(quoteItems.quoteId, existing.id));
        qid = existing.id;
      } else {
        const [created] = await tx
          .insert(quotes)
          .values({ ...values, publicToken: nanoid(24), createdById: user.id })
          .returning({ id: quotes.id });
        qid = created.id;
      }
      await tx.insert(quoteItems).values(items.map((it, position) => ({ ...it, quoteId: qid, position })));
      return qid;
    });

    revalidateQuotes(quoteId);
    redirect(`/admin/orcamentos/${quoteId}?${existing ? "salvo" : "criado"}=1`);
  });
}

function normalizeItems(items: ItemInput[]) {
  return items.map((it) => ({
    kind: it.kind,
    productId: it.kind === "material" ? it.productId : null,
    description: it.description,
    quantity: Math.round(it.quantity * 1000) / 1000,
    unit: it.unit,
    unitPrice: Math.round(it.unitPrice * 100) / 100,
  }));
}

/** Marca como enviado (ao mandar pelo WhatsApp ou copiar o link). */
export async function markQuoteSent(id: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "Orçamento não encontrado." };
    const q = await db.query.quotes.findFirst({ where: eq(quotes.id, id), columns: { status: true, sentAt: true } });
    if (!q) return { ok: false, error: "Orçamento não encontrado." };
    if (!isQuoteOpen(q.status)) return { ok: true };
    await db
      .update(quotes)
      .set({ status: "enviado", sentAt: q.sentAt ?? new Date() })
      .where(and(eq(quotes.id, id), inArray(quotes.status, ["rascunho", "enviado"])));
    revalidateQuotes(id);
    return { ok: true };
  });
}

const approveSchema = z
  .object({
    customer: z.string().nullable(),
    technicianId: z.uuid("Técnico inválido.").nullable(),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.")
      .nullable(),
    scheduledTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Informe um horário válido.")
      .nullable(),
  })
  .refine((v) => !v.scheduledTime || v.scheduledDate, { path: ["scheduledDate"], message: "Informe a data para usar um horário." });

/** Aprovação registrada pela equipe (cliente aprovou por telefone, WhatsApp ou pessoalmente): gera a OM. */
export async function approveQuoteAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "Orçamento não encontrado." };
    const v = formValues(fd);
    const parsed = approveSchema.safeParse({
      customer: v.str("customer"),
      technicianId: v.str("technicianId"),
      scheduledDate: v.str("scheduledDate"),
      scheduledTime: v.str("scheduledTime"),
    });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const d = parsed.data;
    if (d.technicianId) {
      const tech = await db.query.technicians.findFirst({
        where: and(eq(technicians.id, d.technicianId), eq(technicians.active, true)),
        columns: { id: true },
      });
      if (!tech) return { ok: false, error: "Técnico inativo ou não encontrado.", fieldErrors: { technicianId: "Técnico inativo ou não encontrado." } };
    }
    const customer =
      d.customer === "new"
        ? ({ mode: "new" } as const)
        : d.customer?.startsWith("existing:") && isUuid(d.customer.slice(9))
          ? ({ mode: "existing", id: d.customer.slice(9) } as const)
          : ({ mode: "auto" } as const);

    const r = await db.transaction((tx) =>
      approveQuote(tx, id, {
        via: "equipe",
        actor: actor(user),
        decidedByName: user.name,
        customer,
        technicianId: d.technicianId,
        scheduledDate: d.scheduledDate,
        scheduledTime: d.scheduledTime,
      }),
    );
    revalidateQuotes(id);
    revalidatePath("/admin/oms");
    revalidatePath("/admin/agenda");
    revalidatePath("/admin/clientes");
    revalidatePath("/admin");
    return {
      ok: true,
      message: `Orçamento aprovado. ${formatOM(r.workOrder.number)} criada${r.createdCustomer ? " e cliente cadastrado" : ""}.`,
      id: r.workOrder.id,
    };
  });
}

/** Recusa registrada pela equipe. */
export async function rejectQuoteAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "Orçamento não encontrado." };
    const reason = formValues(fd).str("reason")?.slice(0, 500) ?? null;
    await db.transaction((tx) => rejectQuote(tx, id, { via: "equipe", actor: actor(user), decidedByName: user.name, reason }));
    revalidateQuotes(id);
    return { ok: true, message: "Orçamento marcado como recusado" };
  });
}

export async function cancelQuote(id: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "Orçamento não encontrado." };
    const [row] = await db
      .update(quotes)
      .set({ status: "cancelado", decidedAt: new Date() })
      .where(and(eq(quotes.id, id), inArray(quotes.status, ["rascunho", "enviado"])))
      .returning({ id: quotes.id });
    if (!row) return { ok: false, error: "Só orçamentos em aberto podem ser cancelados." };
    revalidateQuotes(id);
    return { ok: true, message: "Orçamento cancelado" };
  });
}

/** Recusado ou cancelado volta a rascunho (o cliente mudou de ideia). */
export async function reopenQuote(id: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "Orçamento não encontrado." };
    const today = todayISO();
    const settings = await getSettings();
    const q = await db.query.quotes.findFirst({ where: eq(quotes.id, id), columns: { validUntil: true } });
    const [row] = await db
      .update(quotes)
      .set({
        status: "rascunho",
        decidedAt: null,
        decidedVia: null,
        decidedByName: null,
        decidedById: null,
        rejectionReason: null,
        // vencido volta com a validade padrão a partir de hoje
        validUntil: q && q.validUntil >= today ? q.validUntil : addDays(today, settings.quoteValidityDays),
      })
      .where(and(eq(quotes.id, id), inArray(quotes.status, ["recusado", "cancelado"])))
      .returning({ id: quotes.id });
    if (!row) return { ok: false, error: "Só orçamentos recusados ou cancelados podem ser reabertos." };
    revalidateQuotes(id);
    return { ok: true, message: "Orçamento reaberto como rascunho" };
  });
}

/** Copia o orçamento (itens, contato e condições) num novo rascunho, com validade a partir de hoje. */
export async function duplicateQuote(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "Orçamento não encontrado." };
    const q = await db.query.quotes.findFirst({ where: eq(quotes.id, id), with: { items: { orderBy: (i, { asc }) => [asc(i.position)] } } });
    if (!q) return { ok: false, error: "Orçamento não encontrado." };
    const settings = await getSettings();
    const newId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(quotes)
        .values({
          customerId: q.customerId,
          contactName: q.contactName,
          contactPersonType: q.contactPersonType,
          contactDocument: q.contactDocument,
          contactPhone: q.contactPhone,
          contactEmail: q.contactEmail,
          zip: q.zip,
          street: q.street,
          addressNumber: q.addressNumber,
          complement: q.complement,
          district: q.district,
          city: q.city,
          state: q.state,
          workType: q.workType,
          title: q.title,
          description: q.description,
          discount: q.discount,
          total: q.total,
          validUntil: addDays(todayISO(), settings.quoteValidityDays),
          terms: q.terms,
          publicToken: nanoid(24),
          createdById: user.id,
        })
        .returning({ id: quotes.id });
      if (q.items.length) {
        await tx.insert(quoteItems).values(
          q.items.map((i) => ({
            quoteId: created.id,
            position: i.position,
            kind: i.kind,
            productId: i.productId,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
          })),
        );
      }
      return created.id;
    });
    revalidateQuotes();
    return { ok: true, id: newId };
  });
}

/** Dados de um cliente cadastrado para preencher o contato e o endereço do orçamento. */
export async function quoteCustomerAction(customerId: string) {
  await assertRole([...STAFF]);
  if (!isUuid(customerId)) return null;
  const c = await db.query.customers.findFirst({
    where: eq(customers.id, customerId),
    columns: { id: true, name: true, tradeName: true, personType: true, document: true, phone: true, whatsapp: true, email: true },
  });
  if (!c) return null;
  const site = await db.query.customerSites.findFirst({
    where: eq(customerSites.customerId, customerId),
    orderBy: (s, { desc, asc }) => [desc(s.isPrimary), asc(s.createdAt)],
  });
  return {
    name: c.tradeName ?? c.name,
    personType: c.personType,
    document: c.document,
    phone: c.whatsapp ?? c.phone,
    email: c.email,
    address: site
      ? {
          zip: site.zip,
          street: site.street,
          number: site.number,
          complement: site.complement,
          district: site.district,
          city: site.city,
          state: site.state,
        }
      : null,
  };
}
