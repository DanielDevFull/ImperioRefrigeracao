import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  contractEquipment,
  contracts,
  customers,
  equipment,
  maintenancePlans,
  receivables,
  technicians,
  workOrders,
} from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { activeWorkOrderStatuses } from "@/lib/labels";
import { PAGE_SIZE } from "@/lib/params";

export const CONTRACT_STATUSES = ["ativo", "suspenso", "cancelado", "encerrado"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export async function contractsOverview() {
  const [row] = await db
    .select({
      active: sql<number>`count(*) filter (where ${contracts.status} = 'ativo')::int`,
      mrr: sql<number>`coalesce(sum(${contracts.monthlyAmount}) filter (where ${contracts.status} = 'ativo'), 0)::float`,
    })
    .from(contracts);
  const [eq_] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contractEquipment)
    .innerJoin(contracts, eq(contracts.id, contractEquipment.contractId))
    .where(and(eq(contractEquipment.active, true), eq(contracts.status, "ativo")));
  const statusCounts = await db
    .select({ status: contracts.status, n: sql<number>`count(*)::int` })
    .from(contracts)
    .groupBy(contracts.status);
  return {
    active: row.active,
    mrr: Number(row.mrr),
    ticket: row.active ? Number(row.mrr) / row.active : 0,
    equipment: eq_.n,
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s.n])) as Partial<Record<ContractStatus, number>>,
  };
}

export async function listContracts({ status, q, page }: { status?: ContractStatus; q?: string; page: number }) {
  const today = todayISO();
  const conds: (SQL | undefined)[] = [status ? eq(contracts.status, status) : undefined];
  if (q) {
    const digits = q.replace(/\D/g, "");
    conds.push(
      or(
        ilike(customers.name, `%${q}%`),
        ilike(customers.tradeName, `%${q}%`),
        ilike(contracts.name, `%${q}%`),
        digits && /^(ct-?)?\d+$/i.test(q.trim()) ? eq(contracts.code, Number(digits)) : undefined,
      ),
    );
  }
  const where = and(...conds);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: contracts.id,
        code: contracts.code,
        name: contracts.name,
        status: contracts.status,
        monthlyAmount: contracts.monthlyAmount,
        billingDay: contracts.billingDay,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        customerId: customers.id,
        customerName: customers.name,
        equipmentCount: sql<number>`(select count(*)::int from ${contractEquipment} ce where ce.contract_id = ${contracts.id} and ce.active)`,
        plans: sql<string[] | null>`(select array_agg(distinct mp.name order by mp.name) from ${contractEquipment} ce join ${maintenancePlans} mp on mp.id = ce.maintenance_plan_id where ce.contract_id = ${contracts.id} and ce.active)`,
        overdue: sql<number>`(select count(*)::int from ${receivables} r where r.contract_id = ${contracts.id} and r.kind = 'mensalidade' and r.status = 'aberto' and r.due_date < ${today})`,
        nextDueDate: sql<string | null>`(select r.due_date::text from ${receivables} r where r.contract_id = ${contracts.id} and r.kind = 'mensalidade' and r.status in ('aberto','em_analise') order by r.due_date limit 1)`,
        nextStatus: sql<string | null>`(select r.status::text from ${receivables} r where r.contract_id = ${contracts.id} and r.kind = 'mensalidade' and r.status in ('aberto','em_analise') order by r.due_date limit 1)`,
        lastPaidDate: sql<string | null>`(select max(r.due_date)::text from ${receivables} r where r.contract_id = ${contracts.id} and r.kind = 'mensalidade' and r.status = 'pago')`,
      })
      .from(contracts)
      .innerJoin(customers, eq(customers.id, contracts.customerId))
      .where(where)
      .orderBy(sql`case ${contracts.status} when 'ativo' then 0 when 'suspenso' then 1 else 2 end`, desc(contracts.code))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(contracts)
      .innerJoin(customers, eq(customers.id, contracts.customerId))
      .where(where),
  ]);
  return { rows, total, today };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | null | undefined): v is string => !!v && UUID.test(v);

export async function getContract(id: string) {
  if (!isUuid(id)) return null;
  return (
    (await db.query.contracts.findFirst({
      where: eq(contracts.id, id),
      with: {
        customer: { columns: { id: true, name: true, code: true, status: true, defaultTechnicianId: true, personType: true } },
        items: {
          with: {
            equipment: {
              columns: { id: true, code: true, brand: true, model: true, location: true, status: true, capacityBtu: true, typeId: true, siteId: true },
              with: { type: { columns: { name: true } }, site: { columns: { name: true } } },
            },
            plan: {
              columns: { id: true, name: true, active: true, isPmoc: true },
              with: { tasks: { columns: { id: true, frequencyMonths: true, position: true } } },
            },
            preferredTechnician: { columns: { id: true, name: true, color: true } },
          },
          orderBy: (t, { asc }) => [asc(t.createdAt)],
        },
      },
    })) ?? null
  );
}

export type ContractDetail = NonNullable<Awaited<ReturnType<typeof getContract>>>;

export async function contractWorkOrders(contractId: string) {
  return db
    .select({
      id: workOrders.id,
      contractEquipmentId: workOrders.contractEquipmentId,
      number: workOrders.number,
      status: workOrders.status,
      type: workOrders.type,
      title: workOrders.title,
      dueDate: workOrders.dueDate,
      scheduledDate: workOrders.scheduledDate,
      equipmentCode: equipment.code,
      equipmentLocation: equipment.location,
      technicianName: technicians.name,
      technicianColor: technicians.color,
    })
    .from(workOrders)
    .innerJoin(contractEquipment, eq(contractEquipment.id, workOrders.contractEquipmentId))
    .leftJoin(equipment, eq(equipment.id, workOrders.equipmentId))
    .leftJoin(technicians, eq(technicians.id, workOrders.technicianId))
    .where(and(eq(contractEquipment.contractId, contractId), inArray(workOrders.status, [...activeWorkOrderStatuses])))
    .orderBy(sql`coalesce(${workOrders.scheduledDate}, ${workOrders.dueDate}) asc nulls last`, asc(workOrders.number))
    .limit(200);
}

/** OMs futuras ainda não iniciadas (abertas/agendadas) — são as canceladas junto com o contrato. */
export async function futureOpenWorkOrderIds({ contractId, contractEquipmentId }: { contractId?: string; contractEquipmentId?: string }) {
  const today = todayISO();
  const rows = await db
    .select({ id: workOrders.id })
    .from(workOrders)
    .innerJoin(contractEquipment, eq(contractEquipment.id, workOrders.contractEquipmentId))
    .where(
      and(
        contractId ? eq(contractEquipment.contractId, contractId) : undefined,
        contractEquipmentId ? eq(contractEquipment.id, contractEquipmentId) : undefined,
        inArray(workOrders.status, ["aberta", "agendada"]),
        sql`coalesce(${workOrders.scheduledDate}, ${workOrders.dueDate}) >= ${today}`,
      ),
    );
  return rows.map((r) => r.id);
}

export async function contractReceivables(contractId: string) {
  return db
    .select({
      id: receivables.id,
      description: receivables.description,
      competence: receivables.competence,
      dueDate: receivables.dueDate,
      amount: receivables.amount,
      discount: receivables.discount,
      paidAmount: receivables.paidAmount,
      paidAt: receivables.paidAt,
      status: receivables.status,
    })
    .from(receivables)
    .where(eq(receivables.contractId, contractId))
    .orderBy(desc(receivables.dueDate))
    .limit(24);
}

/** Equipamentos do cliente com a indicação de cobertura por contrato ativo. */
export async function customerEquipmentWithCoverage(customerId: string) {
  const rows = await db.query.equipment.findMany({
    where: eq(equipment.customerId, customerId),
    columns: { id: true, code: true, brand: true, model: true, location: true, status: true, capacityBtu: true, typeId: true, siteId: true },
    with: {
      type: { columns: { name: true } },
      site: { columns: { name: true } },
      contractLinks: {
        where: eq(contractEquipment.active, true),
        columns: { id: true },
        with: { contract: { columns: { id: true, code: true, name: true, status: true } } },
      },
    },
    orderBy: [asc(equipment.code)],
  });
  return rows.map(({ contractLinks, ...e }) => ({
    ...e,
    typeName: e.type?.name ?? null,
    siteName: e.site?.name ?? null,
    coveredBy: contractLinks[0]?.contract ?? null,
  }));
}

export type CoverageEquipment = Awaited<ReturnType<typeof customerEquipmentWithCoverage>>[number];

export async function activePlansWithTasks() {
  const plans = await db.query.maintenancePlans.findMany({
    where: eq(maintenancePlans.active, true),
    columns: { id: true, name: true, equipmentTypeId: true, isPmoc: true },
    with: { tasks: { columns: { id: true, frequencyMonths: true, position: true } } },
    orderBy: [asc(maintenancePlans.name)],
  });
  return plans;
}

export type PlanOption = Awaited<ReturnType<typeof activePlansWithTasks>>[number];

export async function activeTechnicians() {
  return db
    .select({ id: technicians.id, name: technicians.name })
    .from(technicians)
    .where(eq(technicians.active, true))
    .orderBy(asc(technicians.name));
}

export async function customerOptions() {
  return db
    .select({
      id: customers.id,
      code: customers.code,
      name: customers.name,
      tradeName: customers.tradeName,
      document: customers.document,
      status: customers.status,
      personType: customers.personType,
      defaultTechnicianId: customers.defaultTechnicianId,
    })
    .from(customers)
    .orderBy(asc(customers.name));
}

export type CustomerOption = Awaited<ReturnType<typeof customerOptions>>[number];
