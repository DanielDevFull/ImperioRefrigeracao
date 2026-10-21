import "server-only";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { contractEquipment, contracts, customers, equipmentTypes, maintenancePlans, products } from "@/db/schema";
import { visitIntervalMonths } from "@/server/core/schedule";

export type PlanFilter = "ativos" | "inativos" | "todos";

/** Uso de cada plano em contratos (equipamentos ativos em contratos ativos ou suspensos). */
async function usageByPlan() {
  const rows = await db
    .select({
      planId: contractEquipment.maintenancePlanId,
      equipment: sql<number>`count(*)::int`,
      contracts: sql<number>`count(distinct ${contractEquipment.contractId})::int`,
    })
    .from(contractEquipment)
    .innerJoin(contracts, eq(contracts.id, contractEquipment.contractId))
    .where(and(eq(contractEquipment.active, true), sql`${contracts.status} in ('ativo','suspenso')`))
    .groupBy(contractEquipment.maintenancePlanId);
  return new Map(rows.map((r) => [r.planId, r]));
}

export async function listPlans({ filter, q }: { filter: PlanFilter; q?: string }) {
  const where = and(
    filter === "ativos" ? eq(maintenancePlans.active, true) : filter === "inativos" ? eq(maintenancePlans.active, false) : undefined,
    q ? or(ilike(maintenancePlans.name, `%${q}%`), ilike(maintenancePlans.description, `%${q}%`)) : undefined,
  );
  const [plans, usage, counts] = await Promise.all([
    db.query.maintenancePlans.findMany({
      where,
      with: {
        equipmentType: { columns: { name: true } },
        tasks: { columns: { frequencyMonths: true } },
        materials: { columns: { id: true } },
      },
      orderBy: [asc(maintenancePlans.name)],
    }),
    usageByPlan(),
    db
      .select({ active: maintenancePlans.active, n: sql<number>`count(*)::int` })
      .from(maintenancePlans)
      .groupBy(maintenancePlans.active),
  ]);
  const activeCount = counts.find((c) => c.active)?.n ?? 0;
  const inactiveCount = counts.find((c) => !c.active)?.n ?? 0;
  return {
    counts: { ativos: activeCount, inativos: inactiveCount, todos: activeCount + inactiveCount },
    rows: plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      equipmentType: p.equipmentType?.name ?? null,
      isPmoc: p.isPmoc,
      active: p.active,
      interval: visitIntervalMonths(p.tasks),
      taskCount: p.tasks.length,
      materialCount: p.materials.length,
      visitReferenceValue: p.visitReferenceValue,
      estimatedMinutes: p.estimatedMinutes,
      equipmentUsing: usage.get(p.id)?.equipment ?? 0,
      contractsUsing: usage.get(p.id)?.contracts ?? 0,
    })),
  };
}

export async function getPlanForEdit(id: string) {
  return db.query.maintenancePlans.findFirst({
    where: eq(maintenancePlans.id, id),
    with: {
      tasks: { orderBy: (t, { asc }) => [asc(t.position)] },
      materials: { with: { product: { columns: { id: true, name: true, unit: true } } } },
    },
  });
}

/** Contratos que usam o plano (para avisar antes de desativar). */
export async function contractsUsingPlan(planId: string) {
  const rows = await db
    .select({
      contractId: contracts.id,
      code: contracts.code,
      status: contracts.status,
      customer: customers.name,
      equipment: sql<number>`count(*)::int`,
    })
    .from(contractEquipment)
    .innerJoin(contracts, eq(contracts.id, contractEquipment.contractId))
    .innerJoin(customers, eq(customers.id, contracts.customerId))
    .where(and(eq(contractEquipment.maintenancePlanId, planId), eq(contractEquipment.active, true)))
    .groupBy(contracts.id, contracts.code, contracts.status, customers.name)
    .orderBy(asc(contracts.code));
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(contractEquipment)
    .where(eq(contractEquipment.maintenancePlanId, planId));
  /** total inclui equipamentos já removidos (o histórico impede excluir o plano) */
  return { active: rows, everUsed: total > 0 };
}

export async function planFormOptions() {
  const [types, productRows] = await Promise.all([
    db.select({ id: equipmentTypes.id, name: equipmentTypes.name }).from(equipmentTypes).orderBy(asc(equipmentTypes.name)),
    db
      .select({ id: products.id, name: products.name, unit: products.unit, sku: products.sku, active: products.active })
      .from(products)
      .orderBy(asc(products.name)),
  ]);
  return { types, products: productRows };
}

export type PlanFormOptions = Awaited<ReturnType<typeof planFormOptions>>;
