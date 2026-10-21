import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { payables, products, purchaseOrders, suppliers } from "@/db/schema";
import { onlyDigits } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/params";

export type SupplierFilter = "ativos" | "inativos" | "todos";

const productsCount = sql<number>`(select count(*) from ${products} where ${products.preferredSupplierId} = ${suppliers.id} and ${products.active})::int`;
const openPayables = sql<number>`(select coalesce(sum(${payables.amount}), 0) from ${payables} where ${payables.supplierId} = ${suppliers.id} and ${payables.status} = 'aberto')::float8`;
const ordersInProgress = sql<number>`(select count(*) from ${purchaseOrders} where ${purchaseOrders.supplierId} = ${suppliers.id} and ${purchaseOrders.status} in ('rascunho', 'enviado', 'recebido_parcial'))::int`;

export async function listSuppliers(opts: { q?: string; filter: SupplierFilter; page: number }) {
  const conds: (SQL | undefined)[] = [];
  if (opts.filter === "ativos") conds.push(eq(suppliers.active, true));
  if (opts.filter === "inativos") conds.push(eq(suppliers.active, false));
  if (opts.q) {
    const like = `%${opts.q}%`;
    const digits = onlyDigits(opts.q);
    conds.push(
      or(
        ilike(suppliers.name, like),
        ilike(suppliers.contactName, like),
        ilike(suppliers.email, like),
        digits.length >= 3 ? ilike(suppliers.document, `%${digits}%`) : undefined,
        digits.length >= 3 ? ilike(suppliers.phone, `%${digits}%`) : undefined,
      ),
    );
  }
  const where = and(...conds);
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        document: suppliers.document,
        contactName: suppliers.contactName,
        phone: suppliers.phone,
        email: suppliers.email,
        active: suppliers.active,
        notes: suppliers.notes,
        products: productsCount,
        openPayables,
        ordersInProgress,
      })
      .from(suppliers)
      .where(where)
      .orderBy(desc(suppliers.active), asc(suppliers.name))
      .limit(PAGE_SIZE)
      .offset((opts.page - 1) * PAGE_SIZE),
    db.select({ count: sql<number>`count(*)::int` }).from(suppliers).where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r, openPayables: Number(r.openPayables) })), total: count };
}

export async function supplierCounts() {
  const [row] = await db
    .select({
      active: sql<number>`(count(*) filter (where ${suppliers.active}))::int`,
      inactive: sql<number>`(count(*) filter (where not ${suppliers.active}))::int`,
    })
    .from(suppliers);
  const [money] = await db
    .select({
      open: sql<number>`coalesce(sum(${payables.amount}) filter (where ${payables.status} = 'aberto' and ${payables.supplierId} is not null), 0)::float8`,
    })
    .from(payables);
  const [bought] = await db
    .select({
      total: sql<number>`coalesce(sum(${purchaseOrders.total} + ${purchaseOrders.freight}), 0)::float8`,
    })
    .from(purchaseOrders)
    .where(
      and(
        sql`${purchaseOrders.status} in ('recebido', 'recebido_parcial')`,
        sql`${purchaseOrders.createdAt} >= now() - interval '12 months'`,
      ),
    );
  return {
    active: row?.active ?? 0,
    inactive: row?.inactive ?? 0,
    openPayables: Number(money?.open ?? 0),
    bought12m: Number(bought?.total ?? 0),
  };
}

export async function getSupplier(id: string) {
  return db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
}

export async function supplierStats(id: string) {
  const [orders] = await db
    .select({
      inProgress: sql<number>`(count(*) filter (where ${purchaseOrders.status} in ('enviado', 'recebido_parcial')))::int`,
      bought12m: sql<number>`coalesce(sum(${purchaseOrders.total} + ${purchaseOrders.freight}) filter (where ${purchaseOrders.status} in ('recebido', 'recebido_parcial') and ${purchaseOrders.createdAt} >= now() - interval '12 months'), 0)::float8`,
      lastOrder: sql<string | null>`max(${purchaseOrders.orderDate})::text`,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.supplierId, id));
  const [pay] = await db
    .select({
      open: sql<number>`coalesce(sum(${payables.amount}) filter (where ${payables.status} = 'aberto'), 0)::float8`,
      openCount: sql<number>`(count(*) filter (where ${payables.status} = 'aberto'))::int`,
    })
    .from(payables)
    .where(eq(payables.supplierId, id));
  return {
    inProgress: orders?.inProgress ?? 0,
    bought12m: Number(orders?.bought12m ?? 0),
    lastOrder: orders?.lastOrder ?? null,
    openPayables: Number(pay?.open ?? 0),
    openPayablesCount: pay?.openCount ?? 0,
  };
}

export async function supplierProducts(id: string) {
  return db
    .select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, costPrice: products.costPrice })
    .from(products)
    .where(and(eq(products.preferredSupplierId, id), eq(products.active, true)))
    .orderBy(asc(products.name));
}

export async function supplierPayables(id: string) {
  return db
    .select({
      id: payables.id,
      description: payables.description,
      documentNumber: payables.documentNumber,
      dueDate: payables.dueDate,
      amount: payables.amount,
      status: payables.status,
      paidAt: payables.paidAt,
      purchaseOrderId: payables.purchaseOrderId,
    })
    .from(payables)
    .where(eq(payables.supplierId, id))
    .orderBy(sql`case when ${payables.status} = 'aberto' then 0 else 1 end`, desc(payables.dueDate))
    .limit(12);
}
