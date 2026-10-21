import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, type Tx } from "@/db";
import {
  maintenancePlanMaterials,
  products,
  purchaseRequests,
  stockLevels,
  stockLocations,
  stockMovements,
  workOrders,
} from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";

type DbLike = Tx | typeof db;

export type MovementInput = {
  productId: string;
  locationId: string;
  type: "entrada" | "saida" | "ajuste" | "transferencia" | "consumo_om" | "estorno_om";
  /** positivo entra no local, negativo sai */
  quantity: number;
  unitCost?: number;
  workOrderId?: string | null;
  purchaseOrderId?: string | null;
  transferGroupId?: string | null;
  notes?: string | null;
  userId?: string | null;
};

/** Registra a movimentação e atualiza o saldo do local (pode ficar negativo; a interface avisa). */
export async function moveStock(tx: DbLike, m: MovementInput) {
  if (!m.quantity) return;
  await tx.insert(stockMovements).values({
    productId: m.productId,
    locationId: m.locationId,
    type: m.type,
    quantity: m.quantity,
    unitCost: m.unitCost ?? 0,
    workOrderId: m.workOrderId ?? null,
    purchaseOrderId: m.purchaseOrderId ?? null,
    transferGroupId: m.transferGroupId ?? null,
    notes: m.notes ?? null,
    userId: m.userId ?? null,
  });
  await tx
    .insert(stockLevels)
    .values({ productId: m.productId, locationId: m.locationId, quantity: m.quantity })
    .onConflictDoUpdate({
      target: [stockLevels.productId, stockLevels.locationId],
      set: { quantity: sql`${stockLevels.quantity} + ${m.quantity}`, updatedAt: new Date() },
    });
}

export async function transferStock(
  tx: DbLike,
  t: { productId: string; fromId: string; toId: string; quantity: number; userId?: string | null; notes?: string | null },
) {
  if (t.quantity <= 0) throw new Error("Informe uma quantidade maior que zero.");
  if (t.fromId === t.toId) throw new Error("Origem e destino precisam ser diferentes.");
  const group = randomUUID();
  await moveStock(tx, { ...t, locationId: t.fromId, type: "transferencia", quantity: -t.quantity, transferGroupId: group });
  await moveStock(tx, { ...t, locationId: t.toId, type: "transferencia", quantity: t.quantity, transferGroupId: group });
}

/** Saldo total (todos os locais) por produto. */
export async function totalStock(tx: DbLike, productIds?: string[]) {
  const rows = await tx
    .select({ productId: stockLevels.productId, total: sql<number>`coalesce(sum(${stockLevels.quantity}), 0)::float` })
    .from(stockLevels)
    .where(productIds?.length ? inArray(stockLevels.productId, productIds) : undefined)
    .groupBy(stockLevels.productId);
  return new Map(rows.map((r) => [r.productId, Number(r.total)]));
}

/** Local de estoque do técnico (veículo) ou, na falta, o almoxarifado principal. */
export async function defaultLocationFor(tx: DbLike, technicianId?: string | null) {
  if (technicianId) {
    const v = await tx.query.stockLocations.findFirst({
      where: and(eq(stockLocations.technicianId, technicianId), eq(stockLocations.active, true)),
    });
    if (v) return v;
  }
  const main = await tx.query.stockLocations.findFirst({
    where: and(eq(stockLocations.type, "almoxarifado"), eq(stockLocations.active, true)),
    orderBy: (l, { asc }) => [asc(l.createdAt)],
  });
  if (main) return main;
  const [created] = await tx.insert(stockLocations).values({ name: "Almoxarifado", type: "almoxarifado" }).returning();
  return created;
}

async function openRequestProductIds(tx: DbLike, productIds?: string[]) {
  const rows = await tx
    .select({ productId: purchaseRequests.productId })
    .from(purchaseRequests)
    .where(
      and(
        inArray(purchaseRequests.status, ["aberta", "em_pedido"]),
        productIds?.length ? inArray(purchaseRequests.productId, productIds) : undefined,
      ),
    );
  return new Set(rows.map((r) => r.productId));
}

/**
 * Gera solicitações de compra para produtos abaixo do ponto de reposição
 * (sem duplicar quando já existe solicitação aberta ou em pedido).
 */
export async function ensureReorderRequests(tx: DbLike, opts: { productIds?: string[]; userId?: string | null } = {}) {
  const list = await tx.query.products.findMany({
    where: and(
      eq(products.active, true),
      sql`${products.minStock} > 0`,
      opts.productIds?.length ? inArray(products.id, opts.productIds) : undefined,
    ),
  });
  if (!list.length) return 0;
  const totals = await totalStock(tx, list.map((p) => p.id));
  const open = await openRequestProductIds(tx, list.map((p) => p.id));
  let created = 0;
  for (const p of list) {
    const total = totals.get(p.id) ?? 0;
    if (total >= p.minStock || open.has(p.id)) continue;
    const quantity = Math.max(p.reorderQty || 0, p.minStock - total);
    await tx.insert(purchaseRequests).values({
      productId: p.id,
      quantity,
      reason: "estoque_minimo",
      notes: `Saldo ${total} abaixo do mínimo ${p.minStock}.`,
      createdById: opts.userId ?? null,
    });
    created++;
  }
  return created;
}

export type ForecastRow = {
  productId: string;
  name: string;
  unit: string;
  need: number;
  available: number;
  minStock: number;
  shortage: number;
};

/** Previsão de materiais das OMs preventivas abertas nos próximos `days` dias. */
export async function materialForecast(tx: DbLike, days: number, today = todayISO()): Promise<ForecastRow[]> {
  const until = addDays(today, days);
  const rows = await tx
    .select({
      productId: maintenancePlanMaterials.productId,
      need: sql<number>`sum(${maintenancePlanMaterials.quantity})::float`,
    })
    .from(workOrders)
    .innerJoin(maintenancePlanMaterials, eq(maintenancePlanMaterials.planId, workOrders.maintenancePlanId))
    .where(
      and(
        inArray(workOrders.status, ["aberta", "agendada", "aguardando_material"]),
        gte(workOrders.scheduledDate, today),
        lte(workOrders.scheduledDate, until),
      ),
    )
    .groupBy(maintenancePlanMaterials.productId);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.productId);
  const prods = await tx.query.products.findMany({ where: inArray(products.id, ids) });
  const totals = await totalStock(tx, ids);
  return rows
    .map((r) => {
      const p = prods.find((x) => x.id === r.productId)!;
      const available = totals.get(r.productId) ?? 0;
      const need = Number(r.need);
      const shortage = Math.max(0, need + (p?.minStock ?? 0) - available);
      return {
        productId: r.productId,
        name: p?.name ?? "—",
        unit: p?.unit ?? "un",
        need,
        available,
        minStock: p?.minStock ?? 0,
        shortage,
      };
    })
    .sort((a, b) => b.shortage - a.shortage);
}

/** Cria solicitações de compra para faltas previstas pelas OMs agendadas. */
export async function ensureForecastRequests(tx: DbLike, days: number, today = todayISO()) {
  const forecast = (await materialForecast(tx, days, today)).filter((f) => f.shortage > 0);
  if (!forecast.length) return 0;
  const open = await openRequestProductIds(tx, forecast.map((f) => f.productId));
  let created = 0;
  for (const f of forecast) {
    if (open.has(f.productId)) continue;
    const p = await tx.query.products.findFirst({ where: eq(products.id, f.productId) });
    await tx.insert(purchaseRequests).values({
      productId: f.productId,
      quantity: Math.max(f.shortage, p?.reorderQty ?? 0),
      reason: "om",
      notes: `Previsão: ${f.need} ${f.unit} para as OMs dos próximos ${days} dias; saldo ${f.available}.`,
    });
    created++;
  }
  return created;
}
