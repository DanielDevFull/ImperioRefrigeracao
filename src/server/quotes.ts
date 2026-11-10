import "server-only";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { customerSites, customers, quoteItems, quotes } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { formatBRL, formatCEP, formatDate, formatNumber, formatOM, formatQuote, normalizeDocument, onlyDigits } from "@/lib/format";
import { becomesOmMaterial, isQuoteOpen, quoteTotals } from "./core/quotes";
import { notifyStaff } from "./notify";
import { addWorkOrderMaterial, createWorkOrder, logEvent, type Actor } from "./work-orders";

type DbLike = Tx | typeof db;
type Quote = typeof quotes.$inferSelect;
type QuoteItem = typeof quoteItems.$inferSelect;

export type CustomerMatch = { id: string; code: number; name: string; reason: "documento" | "telefone" | "e-mail" };

/**
 * Cliente já cadastrado com o mesmo CPF/CNPJ, telefone/WhatsApp ou e-mail do contato do orçamento
 * (nessa ordem de confiança). Evita cadastro duplicado quando quem aprova já é cliente.
 */
export async function findMatchingCustomer(
  tx: DbLike,
  q: Pick<Quote, "contactDocument" | "contactPhone" | "contactEmail">,
): Promise<CustomerMatch | null> {
  const cols = { id: true, code: true, name: true } as const;
  const doc = normalizeDocument(q.contactDocument);
  if (doc) {
    const c = await tx.query.customers.findFirst({ where: eq(customers.document, doc), columns: cols });
    if (c) return { ...c, reason: "documento" };
  }
  const phone = onlyDigits(q.contactPhone);
  if (phone.length >= 10) {
    const c = await tx.query.customers.findFirst({
      where: or(eq(customers.phone, phone), eq(customers.whatsapp, phone)),
      columns: cols,
      orderBy: (t, { asc }) => [asc(t.code)],
    });
    if (c) return { ...c, reason: "telefone" };
  }
  const email = q.contactEmail?.trim().toLowerCase();
  if (email) {
    const c = await tx.query.customers.findFirst({
      where: sql`lower(${customers.email}) = ${email}`,
      columns: cols,
      orderBy: (t, { asc }) => [asc(t.code)],
    });
    if (c) return { ...c, reason: "e-mail" };
  }
  return null;
}

async function createCustomerFromQuote(tx: DbLike, q: Quote) {
  const [c] = await tx
    .insert(customers)
    .values({
      personType: q.contactPersonType,
      name: q.contactName,
      document: normalizeDocument(q.contactDocument) || null,
      phone: q.contactPhone,
      whatsapp: q.contactPhone,
      email: q.contactEmail,
      notes: `Cadastrado na aprovação do orçamento ${formatQuote(q.number)}.`,
    })
    .returning({ id: customers.id });
  return c.id;
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Local de atendimento do endereço do orçamento: reaproveita o mesmo endereço ou cadastra um novo. */
async function siteForQuote(tx: DbLike, customerId: string, q: Quote): Promise<string | null> {
  if (!q.street && !q.city) return null;
  const sites = await tx.query.customerSites.findMany({
    where: eq(customerSites.customerId, customerId),
    columns: { id: true, street: true, number: true, zip: true },
  });
  const same = sites.find(
    (s) =>
      (norm(s.street) && norm(s.street) === norm(q.street) && norm(s.number) === norm(q.addressNumber)) ||
      (!q.street && onlyDigits(s.zip) && onlyDigits(s.zip) === onlyDigits(q.zip)),
  );
  if (same) return same.id;
  const name = sites.length === 0 ? "Principal" : [q.street, q.addressNumber].filter(Boolean).join(", ") || q.district || q.city || "Endereço do orçamento";
  const [site] = await tx
    .insert(customerSites)
    .values({
      customerId,
      name: name.slice(0, 120),
      zip: q.zip ? formatCEP(q.zip) : null,
      street: q.street,
      number: q.addressNumber,
      complement: q.complement,
      district: q.district,
      city: q.city,
      state: q.state,
      isPrimary: sites.length === 0,
    })
    .returning({ id: customerSites.id });
  return site.id;
}

/** Descrição da OM: o escopo do orçamento e os serviços combinados (os materiais vão como materiais da OM). */
function omDescription(q: Quote, items: QuoteItem[]) {
  const services = items.filter((i) => !becomesOmMaterial(i));
  const lines = services.map((i) => `• ${i.description} (${formatNumber(i.quantity)} ${i.unit})`);
  return [q.description?.trim(), lines.length ? `Serviços do orçamento ${formatQuote(q.number)}:\n${lines.join("\n")}` : null]
    .filter(Boolean)
    .join("\n\n");
}

async function lockOpenQuote(tx: Tx, quoteId: string) {
  const [q] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
  if (!q) throw new Error("Orçamento não encontrado.");
  if (!isQuoteOpen(q.status)) {
    throw new Error(
      q.status === "aprovado"
        ? "Este orçamento já foi aprovado."
        : q.status === "recusado"
          ? "Este orçamento foi recusado."
          : "Este orçamento foi cancelado.",
    );
  }
  return q;
}

export type ApproveQuoteInput = {
  /** "cliente": aprovado pelo link público; "equipe": registrado no sistema */
  via: "cliente" | "equipe";
  actor: Actor;
  decidedByName: string | null;
  /** Só quando o orçamento ainda não tem cliente: usar o cadastro parecido, um escolhido, ou cadastrar novo */
  customer?: { mode: "auto" } | { mode: "new" } | { mode: "existing"; id: string };
  technicianId?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
};

/**
 * Aprova o orçamento e gera a OM cobrada do cliente: cadastra (ou reaproveita) cliente e local,
 * cria a OM com a mão de obra dos serviços e lança os materiais do estoque pelo preço orçado.
 * Trava a linha do orçamento: dois cliques (ou cliente e equipe ao mesmo tempo) geram uma OM só.
 */
export async function approveQuote(tx: Tx, quoteId: string, input: ApproveQuoteInput) {
  const q = await lockOpenQuote(tx, quoteId);
  if (input.via === "cliente" && q.validUntil < todayISO()) {
    throw new Error(`Este orçamento venceu em ${formatDate(q.validUntil)}. Fale com a gente para atualizar os valores.`);
  }
  const items = await tx.query.quoteItems.findMany({ where: eq(quoteItems.quoteId, q.id), orderBy: [asc(quoteItems.position)] });
  if (!items.length) throw new Error("O orçamento não tem itens.");
  const totals = quoteTotals(items, q.discount);

  let customerId = q.customerId;
  let createdCustomer = false;
  if (!customerId) {
    const choice = input.customer ?? { mode: "auto" };
    if (choice.mode === "existing") {
      const c = await tx.query.customers.findFirst({ where: eq(customers.id, choice.id), columns: { id: true } });
      if (!c) throw new Error("O cliente escolhido não existe mais.");
      customerId = c.id;
    } else if (choice.mode === "auto") {
      customerId = (await findMatchingCustomer(tx, q))?.id ?? null;
    }
    if (!customerId) {
      customerId = await createCustomerFromQuote(tx, q);
      createdCustomer = true;
    }
  }
  const siteId = await siteForQuote(tx, customerId, q);

  const wo = await createWorkOrder(
    tx,
    {
      type: q.workType,
      origin: "orcamento",
      customerId,
      siteId,
      technicianId: input.technicianId ?? null,
      scheduledDate: input.scheduledDate ?? null,
      scheduledTime: input.scheduledTime ?? null,
      title: q.title,
      description: omDescription(q, items),
      laborAmount: Math.max(0, totals.labor),
      billable: true,
    },
    input.actor,
  );
  if (!wo) throw new Error("Não foi possível gerar a OM. Tente de novo.");

  for (const it of items) {
    if (!becomesOmMaterial(it)) continue;
    await addWorkOrderMaterial(
      tx,
      wo.id,
      { productId: it.productId!, quantity: it.quantity, chargeCustomer: true, unitPrice: it.unitPrice },
      input.actor,
    );
  }

  const who =
    input.via === "cliente"
      ? `pelo cliente${input.decidedByName ? ` (${input.decidedByName})` : ""}, pelo link`
      : `pela equipe${input.decidedByName ? ` (${input.decidedByName})` : ""}`;
  await logEvent(tx, wo.id, {
    kind: "note",
    message: `Orçamento ${formatQuote(q.number)} aprovado ${who}: ${formatBRL(totals.total)}.`,
    actor: input.actor,
  });

  await tx
    .update(quotes)
    .set({
      status: "aprovado",
      decidedAt: new Date(),
      decidedVia: input.via,
      decidedByName: input.decidedByName,
      decidedById: input.actor.userId,
      rejectionReason: null,
      customerId,
      workOrderId: wo.id,
      total: totals.total,
    })
    .where(eq(quotes.id, q.id));

  if (input.via === "cliente") {
    await notifyStaff(tx, {
      title: `Orçamento ${formatQuote(q.number)} aprovado`,
      body: `${q.contactName} aprovou ${formatBRL(totals.total)}. ${formatOM(wo.number)} está na fila de despacho${createdCustomer ? " e o cliente foi cadastrado" : ""}.`,
      link: `/admin/oms/${wo.id}`,
    });
  }
  return { quote: q, workOrder: wo, customerId, createdCustomer, totals };
}

/** Recusa o orçamento (pelo cliente no link ou registrado pela equipe). */
export async function rejectQuote(
  tx: Tx,
  quoteId: string,
  input: { via: "cliente" | "equipe"; actor: Actor; decidedByName: string | null; reason: string | null },
) {
  const q = await lockOpenQuote(tx, quoteId);
  await tx
    .update(quotes)
    .set({
      status: "recusado",
      decidedAt: new Date(),
      decidedVia: input.via,
      decidedByName: input.decidedByName,
      decidedById: input.actor.userId,
      rejectionReason: input.reason,
    })
    .where(eq(quotes.id, q.id));
  if (input.via === "cliente") {
    await notifyStaff(tx, {
      title: `Orçamento ${formatQuote(q.number)} recusado`,
      body: `${q.contactName} recusou o orçamento${input.reason ? `: "${input.reason}"` : "."}`,
      link: `/admin/orcamentos/${q.id}`,
    });
  }
  return q;
}

/** Primeira abertura do link pelo cliente (chamada pelo navegador, não por robôs de pré-visualização). */
export async function markQuoteViewed(token: string) {
  await db
    .update(quotes)
    .set({ viewedAt: new Date() })
    .where(and(eq(quotes.publicToken, token), isNull(quotes.viewedAt)));
}
