import "server-only";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  payables,
  products,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequests,
  suppliers,
  user,
  workOrders,
} from "@/db/schema";
import { PAGE_SIZE } from "@/lib/params";

export const ORDER_STATUSES = ["rascunho", "enviado", "recebido_parcial", "recebido", "cancelado"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export async function listOpenRequests() {
  const rows = await db
    .select({
      id: purchaseRequests.id,
      quantity: purchaseRequests.quantity,
      reason: purchaseRequests.reason,
      status: purchaseRequests.status,
      notes: purchaseRequests.notes,
      createdAt: purchaseRequests.createdAt,
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      unit: products.unit,
      costPrice: products.costPrice,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      workOrderId: purchaseRequests.workOrderId,
      workOrderNumber: workOrders.number,
      purchaseOrderId: purchaseRequests.purchaseOrderId,
      purchaseOrderNumber: purchaseOrders.number,
      purchaseOrderStatus: purchaseOrders.status,
    })
    .from(purchaseRequests)
    .innerJoin(products, eq(products.id, purchaseRequests.productId))
    .leftJoin(suppliers, eq(suppliers.id, products.preferredSupplierId))
    .leftJoin(workOrders, eq(workOrders.id, purchaseRequests.workOrderId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, purchaseRequests.purchaseOrderId))
    .where(inArray(purchaseRequests.status, ["aberta", "em_pedido"]))
    .orderBy(asc(purchaseRequests.status), desc(purchaseRequests.createdAt));
  return rows;
}
export type OpenRequest = Awaited<ReturnType<typeof listOpenRequests>>[number];

export async function getOrderReadouts() {
  const [row] = await db
    .select({
      inProgress: sql<number>`(count(*) filter (where ${purchaseOrders.status} in ('enviado', 'recebido_parcial')))::int`,
      drafts: sql<number>`(count(*) filter (where ${purchaseOrders.status} = 'rascunho'))::int`,
      openValue: sql<number>`coalesce(sum(${purchaseOrders.total} + ${purchaseOrders.freight}) filter (where ${purchaseOrders.status} in ('rascunho', 'enviado', 'recebido_parcial')), 0)::float8`,
      late: sql<number>`(count(*) filter (where ${purchaseOrders.status} in ('enviado', 'recebido_parcial') and ${purchaseOrders.expectedDate} < (now() at time zone 'America/Sao_Paulo')::date))::int`,
    })
    .from(purchaseOrders);
  return {
    inProgress: row?.inProgress ?? 0,
    drafts: row?.drafts ?? 0,
    openValue: Number(row?.openValue ?? 0),
    late: row?.late ?? 0,
  };
}

const itemsCount = sql<number>`(select count(*) from ${purchaseOrderItems} where ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id})::int`;

export async function listPurchaseOrders(opts: { status?: OrderStatus; supplierId?: string; page: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const conds: (SQL | undefined)[] = [
    opts.status ? eq(purchaseOrders.status, opts.status) : undefined,
    opts.supplierId ? eq(purchaseOrders.supplierId, opts.supplierId) : undefined,
  ];
  const where = and(...conds);
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.number,
        status: purchaseOrders.status,
        orderDate: purchaseOrders.orderDate,
        expectedDate: purchaseOrders.expectedDate,
        receivedAt: purchaseOrders.receivedAt,
        total: purchaseOrders.total,
        freight: purchaseOrders.freight,
        createdAt: purchaseOrders.createdAt,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        items: itemsCount,
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(where)
      .orderBy(desc(purchaseOrders.number))
      .limit(pageSize)
      .offset((opts.page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(purchaseOrders).where(where),
  ]);
  return { rows, total: count };
}
export type OrderRow = Awaited<ReturnType<typeof listPurchaseOrders>>["rows"][number];

export async function orderStatusCounts() {
  const rows = await db
    .select({ status: purchaseOrders.status, count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .groupBy(purchaseOrders.status);
  const map = Object.fromEntries(rows.map((r) => [r.status, r.count])) as Partial<Record<OrderStatus, number>>;
  return { ...map, all: rows.reduce((a, r) => a + r.count, 0) };
}

export async function getPurchaseOrder(id: string) {
  const order = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, id),
    with: {
      supplier: true,
      location: true,
      items: { with: { product: true } },
      requests: { with: { product: true } },
    },
  });
  if (!order) return null;
  const [payable, createdBy] = await Promise.all([
    order.payableId ? db.query.payables.findFirst({ where: eq(payables.id, order.payableId) }) : null,
    order.createdById ? db.query.user.findFirst({ where: eq(user.id, order.createdById), columns: { name: true } }) : null,
  ]);
  order.items.sort((a, b) => a.product.name.localeCompare(b.product.name, "pt-BR"));
  return { ...order, payable: payable ?? null, createdByName: createdBy?.name ?? null };
}
export type PurchaseOrderDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseOrder>>>;

/** Produtos que já têm solicitação aberta ou em pedido. */
export async function productsWithOpenRequest() {
  const rows = await db
    .selectDistinct({ productId: purchaseRequests.productId })
    .from(purchaseRequests)
    .where(inArray(purchaseRequests.status, ["aberta", "em_pedido"]));
  return new Set(rows.map((r) => r.productId));
}
