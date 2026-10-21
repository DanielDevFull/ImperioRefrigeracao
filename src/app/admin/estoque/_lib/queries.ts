import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  products,
  purchaseOrders,
  purchaseRequests,
  stockLevels,
  stockLocations,
  stockMovements,
  suppliers,
  technicians,
  user,
  workOrders,
} from "@/db/schema";
import { PAGE_SIZE } from "@/lib/params";
import { TZ } from "@/lib/dates";
import type { LevelsMap, MovementData, PickerLocation, PickerProduct } from "./types";

/** Saldo somado de todos os locais, por produto. */
function totalsSubquery() {
  return db
    .select({
      productId: stockLevels.productId,
      total: sql<number>`sum(${stockLevels.quantity})::float8`.as("total"),
    })
    .from(stockLevels)
    .groupBy(stockLevels.productId)
    .as("totals");
}

export type StockFilter = "todos" | "abaixo" | "inativos";

export async function getStockReadouts() {
  const t = totalsSubquery();
  const [[counts], [value], [requests]] = await Promise.all([
    db
      .select({
        active: sql<number>`(count(*) filter (where ${products.active}))::int`,
        below: sql<number>`(count(*) filter (where ${products.active} and ${products.minStock} > 0 and coalesce(${t.total}, 0) < ${products.minStock}))::int`,
        empty: sql<number>`(count(*) filter (where ${products.active} and ${products.minStock} > 0 and coalesce(${t.total}, 0) <= 0))::int`,
      })
      .from(products)
      .leftJoin(t, eq(t.productId, products.id)),
    db
      .select({
        value: sql<number>`coalesce(sum(greatest(${stockLevels.quantity}, 0) * ${products.costPrice}), 0)::float8`,
      })
      .from(stockLevels)
      .innerJoin(products, eq(products.id, stockLevels.productId))
      .where(eq(products.active, true)),
    db
      .select({ open: sql<number>`count(*)::int` })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.status, "aberta")),
  ]);
  return {
    active: counts?.active ?? 0,
    below: counts?.below ?? 0,
    empty: counts?.empty ?? 0,
    value: Number(value?.value ?? 0),
    openRequests: requests?.open ?? 0,
  };
}

export async function listProducts(opts: {
  q?: string;
  filter: StockFilter;
  category?: string;
  locationId?: string;
  page: number;
}) {
  const t = totalsSubquery();
  const conds: (SQL | undefined)[] = [];
  conds.push(eq(products.active, opts.filter !== "inativos"));
  if (opts.filter === "abaixo")
    conds.push(sql`${products.minStock} > 0 and coalesce(${t.total}, 0) < ${products.minStock}`);
  if (opts.category) conds.push(eq(products.category, opts.category));
  if (opts.q) {
    const like = `%${opts.q}%`;
    conds.push(or(ilike(products.name, like), ilike(products.sku, like), ilike(products.barcode, like)));
  }
  if (opts.locationId)
    conds.push(
      sql`exists (select 1 from ${stockLevels} where ${stockLevels.productId} = ${products.id} and ${stockLevels.locationId} = ${opts.locationId} and ${stockLevels.quantity} <> 0)`,
    );
  const where = and(...conds);
  const locationQty = opts.locationId
    ? sql<number>`coalesce((select ${stockLevels.quantity} from ${stockLevels} where ${stockLevels.productId} = ${products.id} and ${stockLevels.locationId} = ${opts.locationId}), 0)::float8`
    : sql<number>`null`;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        category: products.category,
        unit: products.unit,
        costPrice: products.costPrice,
        salePrice: products.salePrice,
        minStock: products.minStock,
        reorderQty: products.reorderQty,
        active: products.active,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        total: sql<number>`coalesce(${t.total}, 0)::float8`,
        locationQty,
      })
      .from(products)
      .leftJoin(t, eq(t.productId, products.id))
      .leftJoin(suppliers, eq(suppliers.id, products.preferredSupplierId))
      .where(where)
      .orderBy(asc(products.name))
      .limit(PAGE_SIZE)
      .offset((opts.page - 1) * PAGE_SIZE),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .leftJoin(t, eq(t.productId, products.id))
      .where(where),
  ]);
  return {
    rows: rows.map((r) => ({
      ...r,
      total: Number(r.total),
      locationQty: r.locationQty == null ? null : Number(r.locationQty),
    })),
    total: count,
  };
}

export async function getFilterCounts() {
  const t = totalsSubquery();
  const [row] = await db
    .select({
      all: sql<number>`(count(*) filter (where ${products.active}))::int`,
      below: sql<number>`(count(*) filter (where ${products.active} and ${products.minStock} > 0 and coalesce(${t.total}, 0) < ${products.minStock}))::int`,
      inactive: sql<number>`(count(*) filter (where not ${products.active}))::int`,
    })
    .from(products)
    .leftJoin(t, eq(t.productId, products.id));
  return row ?? { all: 0, below: 0, inactive: 0 };
}

export async function listLocationsSummary() {
  const rows = await db
    .select({
      id: stockLocations.id,
      name: stockLocations.name,
      type: stockLocations.type,
      active: stockLocations.active,
      technicianId: stockLocations.technicianId,
      technicianName: technicians.name,
      vehiclePlate: technicians.vehiclePlate,
      items: sql<number>`(count(${stockLevels.productId}) filter (where ${stockLevels.quantity} > 0))::int`,
      value: sql<number>`coalesce(sum(${stockLevels.quantity} * ${products.costPrice}) filter (where ${stockLevels.quantity} > 0), 0)::float8`,
    })
    .from(stockLocations)
    .leftJoin(stockLevels, eq(stockLevels.locationId, stockLocations.id))
    .leftJoin(products, eq(products.id, stockLevels.productId))
    .leftJoin(technicians, eq(technicians.id, stockLocations.technicianId))
    .groupBy(stockLocations.id, technicians.name, technicians.vehiclePlate)
    .orderBy(desc(stockLocations.active), asc(stockLocations.type), asc(stockLocations.name));
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
}

export async function listTechnicianOptions() {
  return db
    .select({ id: technicians.id, name: technicians.name, vehiclePlate: technicians.vehiclePlate })
    .from(technicians)
    .where(eq(technicians.active, true))
    .orderBy(asc(technicians.name));
}

/** Dados para os diálogos de movimentação (produtos ativos, locais ativos e saldos). */
export async function getMovementData(productId?: string): Promise<MovementData> {
  const [prods, locs, levels] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        unit: products.unit,
        costPrice: products.costPrice,
      })
      .from(products)
      .where(productId ? eq(products.id, productId) : eq(products.active, true))
      .orderBy(asc(products.name)),
    db
      .select({
        id: stockLocations.id,
        name: stockLocations.name,
        type: stockLocations.type,
        technicianName: technicians.name,
      })
      .from(stockLocations)
      .leftJoin(technicians, eq(technicians.id, stockLocations.technicianId))
      .where(eq(stockLocations.active, true))
      .orderBy(asc(stockLocations.type), asc(stockLocations.createdAt)),
    db
      .select({ productId: stockLevels.productId, locationId: stockLevels.locationId, quantity: stockLevels.quantity })
      .from(stockLevels)
      .where(productId ? eq(stockLevels.productId, productId) : undefined),
  ]);
  const map: LevelsMap = {};
  for (const l of levels) {
    (map[l.productId] ??= {})[l.locationId] = l.quantity;
  }
  return {
    products: prods satisfies PickerProduct[],
    locations: locs satisfies PickerLocation[],
    levels: map,
  };
}

export async function getProduct(id: string) {
  return db.query.products.findFirst({
    where: eq(products.id, id),
    with: { preferredSupplier: true },
  });
}

export async function getProductLevels(productId: string) {
  const rows = await db
    .select({
      locationId: stockLocations.id,
      name: stockLocations.name,
      type: stockLocations.type,
      active: stockLocations.active,
      technicianId: stockLocations.technicianId,
      technicianName: technicians.name,
      quantity: sql<number>`coalesce(${stockLevels.quantity}, 0)::float8`,
      updatedAt: stockLevels.updatedAt,
    })
    .from(stockLocations)
    .leftJoin(
      stockLevels,
      and(eq(stockLevels.locationId, stockLocations.id), eq(stockLevels.productId, productId)),
    )
    .leftJoin(technicians, eq(technicians.id, stockLocations.technicianId))
    .where(or(eq(stockLocations.active, true), sql`coalesce(${stockLevels.quantity}, 0) <> 0`))
    .orderBy(asc(stockLocations.type), asc(stockLocations.createdAt));
  return rows.map((r) => ({ ...r, quantity: Number(r.quantity) }));
}

export async function listProductMovements(productId: string, page: number, pageSize = 20) {
  const where = eq(stockMovements.productId, productId);
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        unitCost: stockMovements.unitCost,
        notes: stockMovements.notes,
        createdAt: stockMovements.createdAt,
        transferGroupId: stockMovements.transferGroupId,
        locationId: stockMovements.locationId,
        locationName: stockLocations.name,
        userName: user.name,
        workOrderId: stockMovements.workOrderId,
        workOrderNumber: workOrders.number,
        purchaseOrderId: stockMovements.purchaseOrderId,
        purchaseOrderNumber: purchaseOrders.number,
      })
      .from(stockMovements)
      .leftJoin(stockLocations, eq(stockLocations.id, stockMovements.locationId))
      .leftJoin(user, eq(user.id, stockMovements.userId))
      .leftJoin(workOrders, eq(workOrders.id, stockMovements.workOrderId))
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, stockMovements.purchaseOrderId))
      .where(where)
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.quantity))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(stockMovements).where(where),
  ]);
  return { rows, total: count, pageSize };
}

/** Consumo líquido em OMs (consumo − estornos) por mês, nos últimos 90 dias. */
export async function productConsumption(productId: string, today: string) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  // fuso como literal (parâmetros diferentes no SELECT e no GROUP BY não seriam reconhecidos como iguais)
  const month = sql<string>`to_char(${stockMovements.createdAt} at time zone ${sql.raw(`'${TZ}'`)}, 'YYYY-MM')`;
  const rows = await db
    .select({ month, used: sql<number>`(-sum(${stockMovements.quantity}))::float8` })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.productId, productId),
        inArray(stockMovements.type, ["consumo_om", "estorno_om"]),
        gte(stockMovements.createdAt, since),
      ),
    )
    .groupBy(month);
  const byMonth = new Map(rows.map((r) => [r.month, Math.max(0, Number(r.used))]));
  // Meses cobertos pela janela de 90 dias (normalmente 4)
  const out: { month: string; label: string; consumo: number }[] = [];
  const [ty, tm] = today.split("-").map(Number);
  const sinceISO = since.toISOString().slice(0, 7);
  for (let i = 3; i >= 0; i--) {
    const d = new Date(Date.UTC(ty, tm - 1 - i, 15));
    const key = d.toISOString().slice(0, 7);
    if (key < sinceISO) continue;
    const label = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
      .format(d)
      .replace(".", "");
    out.push({ month: key, label: label.charAt(0).toUpperCase() + label.slice(1), consumo: byMonth.get(key) ?? 0 });
  }
  return out;
}

export async function getProductRequests(productId: string) {
  return db.query.purchaseRequests.findMany({
    where: and(eq(purchaseRequests.productId, productId), inArray(purchaseRequests.status, ["aberta", "em_pedido"])),
    with: { purchaseOrder: true },
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });
}

export async function listSupplierOptions() {
  return db
    .select({ id: suppliers.id, name: suppliers.name, active: suppliers.active })
    .from(suppliers)
    .orderBy(desc(suppliers.active), asc(suppliers.name));
}

export async function skuTaken(sku: string, exceptId?: string) {
  const row = await db.query.products.findFirst({
    where: and(eq(products.sku, sku), exceptId ? ne(products.id, exceptId) : undefined),
    columns: { id: true },
  });
  return Boolean(row);
}

export async function listActiveLocations(): Promise<PickerLocation[]> {
  return db
    .select({
      id: stockLocations.id,
      name: stockLocations.name,
      type: stockLocations.type,
      technicianName: technicians.name,
    })
    .from(stockLocations)
    .leftJoin(technicians, eq(technicians.id, stockLocations.technicianId))
    .where(eq(stockLocations.active, true))
    .orderBy(asc(stockLocations.type), asc(stockLocations.createdAt));
}

/** Produtos ativos para seletores (nome, SKU, unidade e custo atual). */
export async function listProductOptions(): Promise<PickerProduct[]> {
  return db
    .select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, costPrice: products.costPrice })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.name));
}
