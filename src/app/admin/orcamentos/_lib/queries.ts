import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, products, quotes, user } from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import { onlyDigits } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/params";

/** Abas da lista: "" = em aberto (rascunho/enviado dentro da validade). */
export const QUOTE_FILTERS = ["", "vencidos", "aprovado", "recusado", "cancelado", "todos"] as const;
export type QuoteFilter = (typeof QUOTE_FILTERS)[number];

export const isQuoteFilter = (v: string | null | undefined): v is QuoteFilter => (QUOTE_FILTERS as readonly string[]).includes(v ?? "");

const OPEN = ["rascunho", "enviado"] as const;

function filterCond(f: QuoteFilter, today: string): SQL | undefined {
  switch (f) {
    case "":
      return and(inArray(quotes.status, [...OPEN]), gte(quotes.validUntil, today));
    case "vencidos":
      return and(inArray(quotes.status, [...OPEN]), lt(quotes.validUntil, today));
    case "aprovado":
    case "recusado":
    case "cancelado":
      return eq(quotes.status, f);
    default:
      return undefined;
  }
}

function searchCond(q: string | null) {
  const term = q?.trim();
  if (!term) return undefined;
  const like = `%${term}%`;
  const digits = onlyDigits(term);
  const parts: SQL[] = [ilike(quotes.contactName, like), ilike(quotes.title, like)];
  if (digits.length >= 3) parts.push(ilike(quotes.contactPhone, `%${digits}%`));
  // ORC-00012, 12, 00012
  const num = /^(orc-?)?0*(\d{1,7})$/i.exec(term.replace(/\s/g, ""));
  if (num) parts.push(eq(quotes.number, Number(num[2])));
  return or(...parts);
}

export async function listQuotes({ filter, q, page }: { filter: QuoteFilter; q: string | null; page: number }) {
  const today = todayISO();
  const where = and(filterCond(filter, today), searchCond(q));
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: quotes.id,
        number: quotes.number,
        status: quotes.status,
        contactName: quotes.contactName,
        contactPhone: quotes.contactPhone,
        customerId: quotes.customerId,
        title: quotes.title,
        total: quotes.total,
        validUntil: quotes.validUntil,
        createdAt: quotes.createdAt,
        sentAt: quotes.sentAt,
        viewedAt: quotes.viewedAt,
        decidedAt: quotes.decidedAt,
        workOrderId: quotes.workOrderId,
      })
      .from(quotes)
      .where(where)
      .orderBy(desc(quotes.number))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(quotes).where(where),
  ]);
  return { rows, total: n, today };
}

/** Contagem por aba e números do topo da lista. */
export async function quotesOverview() {
  const today = todayISO();
  const monthStart = `${today.slice(0, 8)}01`;
  const since90 = addDays(today, -90);
  const [row] = await db
    .select({
      open: sql<number>`count(*) filter (where ${quotes.status} in ('rascunho','enviado') and ${quotes.validUntil} >= ${today})::int`,
      openValue: sql<number>`coalesce(sum(${quotes.total}) filter (where ${quotes.status} in ('rascunho','enviado') and ${quotes.validUntil} >= ${today}), 0)::float`,
      expired: sql<number>`count(*) filter (where ${quotes.status} in ('rascunho','enviado') and ${quotes.validUntil} < ${today})::int`,
      expiringSoon: sql<number>`count(*) filter (where ${quotes.status} in ('rascunho','enviado') and ${quotes.validUntil} between ${today} and ${addDays(today, 3)})::int`,
      approved: sql<number>`count(*) filter (where ${quotes.status} = 'aprovado')::int`,
      rejected: sql<number>`count(*) filter (where ${quotes.status} = 'recusado')::int`,
      cancelled: sql<number>`count(*) filter (where ${quotes.status} = 'cancelado')::int`,
      all: sql<number>`count(*)::int`,
      approvedMonth: sql<number>`coalesce(sum(${quotes.total}) filter (where ${quotes.status} = 'aprovado' and ${quotes.decidedAt} >= ${monthStart}::timestamp at time zone 'America/Sao_Paulo'), 0)::float`,
      approvedMonthCount: sql<number>`count(*) filter (where ${quotes.status} = 'aprovado' and ${quotes.decidedAt} >= ${monthStart}::timestamp at time zone 'America/Sao_Paulo')::int`,
      decided90: sql<number>`count(*) filter (where ${quotes.status} in ('aprovado','recusado') and ${quotes.decidedAt} >= ${since90}::timestamp at time zone 'America/Sao_Paulo')::int`,
      approved90: sql<number>`count(*) filter (where ${quotes.status} = 'aprovado' and ${quotes.decidedAt} >= ${since90}::timestamp at time zone 'America/Sao_Paulo')::int`,
    })
    .from(quotes);
  return { ...row, approvalRate: row.decided90 ? row.approved90 / row.decided90 : null };
}

export async function getQuote(id: string) {
  const q = await db.query.quotes.findFirst({
    where: eq(quotes.id, id),
    with: {
      items: { orderBy: (i, { asc }) => [asc(i.position)], with: { product: { columns: { id: true, name: true, sku: true, active: true } } } },
      customer: { columns: { id: true, code: true, name: true, tradeName: true } },
      workOrder: { columns: { id: true, number: true, status: true, scheduledDate: true, technicianId: true } },
    },
  });
  if (!q) return null;
  const [creator, decider] = await Promise.all([
    q.createdById ? db.query.user.findFirst({ where: eq(user.id, q.createdById), columns: { name: true } }) : null,
    q.decidedById ? db.query.user.findFirst({ where: eq(user.id, q.decidedById), columns: { name: true } }) : null,
  ]);
  return { ...q, createdByName: creator?.name ?? null, decidedByUserName: decider?.name ?? null };
}

export type QuoteProduct = { id: string; name: string; sku: string | null; unit: string; salePrice: number };

/** Produtos ativos para o item "material do estoque" (preço de venda sugerido). */
export async function quoteProductOptions(): Promise<QuoteProduct[]> {
  return db
    .select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, salePrice: products.salePrice })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.name));
}

/** Clientes ativos para o seletor (orçamento de cliente cadastrado e escolha na aprovação). */
export async function quoteCustomerOptions() {
  return db.query.customers.findMany({
    where: ne(customers.status, "inativo"),
    columns: { id: true, code: true, name: true, tradeName: true, document: true },
    orderBy: (c, { asc }) => [asc(c.name)],
  });
}
