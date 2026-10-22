import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contractEquipment,
  contracts,
  customers,
  equipment,
  equipmentTypes,
  jobRuns,
  maintenancePlans,
  pmocDocuments,
  products,
  purchaseRequests,
  receivables,
  stockLevels,
  technicianAbsences,
  technicians,
  workOrders,
} from "@/db/schema";
import { activeWorkOrderStatuses } from "@/lib/labels";
import { addDays, addMonths, endOfMonth, startOfMonth, TZ, type ISODate } from "@/lib/dates";
import { generationIssues } from "@/server/scheduler";
import { getSettings } from "@/server/settings";

const ACTIVE = [...activeWorkOrderStatuses];
const PREVENTIVE_TYPES = ["preventiva", "pmoc"] as const;

/** Leitura de 6 números do topo do painel. */
export async function getReadouts(today: ISODate) {
  const in30 = addDays(today, 30);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const net = sql`(${receivables.amount} - ${receivables.discount})`;

  const [[c], [ce], [w], [r]] = await Promise.all([
    db
      .select({
        mrr: sql<number>`coalesce(sum(${contracts.monthlyAmount}), 0)::float8`,
        active: sql<number>`count(*)::int`,
      })
      .from(contracts)
      .where(eq(contracts.status, "ativo")),
    db
      .select({ covered: sql<number>`count(*)::int` })
      .from(contractEquipment)
      .innerJoin(contracts, eq(contracts.id, contractEquipment.contractId))
      .where(and(eq(contractEquipment.active, true), eq(contracts.status, "ativo"))),
    db
      .select({
        today: sql<number>`count(*) filter (where ${workOrders.scheduledDate} = ${today} and ${workOrders.status} <> 'cancelada')::int`,
        todayDone: sql<number>`count(*) filter (where ${workOrders.scheduledDate} = ${today} and ${workOrders.status} = 'concluida')::int`,
        overdue: sql<number>`count(*) filter (where ${inArray(workOrders.status, ACTIVE)} and ${workOrders.scheduledDate} < ${today})::int`,
        oldestOverdue: sql<string | null>`(min(${workOrders.scheduledDate}) filter (where ${inArray(workOrders.status, ACTIVE)} and ${workOrders.scheduledDate} < ${today}))::text`,
      })
      .from(workOrders),
    db
      .select({
        overdue: sql<number>`coalesce(sum(${net}) filter (where ${receivables.status} = 'aberto' and ${receivables.dueDate} < ${today}), 0)::float8`,
        overdueCount: sql<number>`count(*) filter (where ${receivables.status} = 'aberto' and ${receivables.dueDate} < ${today})::int`,
        next30: sql<number>`coalesce(sum(${net}) filter (where ${receivables.status} in ('aberto', 'em_analise') and ${receivables.dueDate} between ${today} and ${in30}), 0)::float8`,
        next30Count: sql<number>`count(*) filter (where ${receivables.status} in ('aberto', 'em_analise') and ${receivables.dueDate} between ${today} and ${in30})::int`,
        monthBilled: sql<number>`coalesce(sum(${net}) filter (where ${receivables.status} <> 'cancelado' and ${receivables.dueDate} between ${monthStart} and ${monthEnd}), 0)::float8`,
      })
      .from(receivables),
  ]);

  const monthBase = r.monthBilled > 0 ? r.monthBilled : c.mrr;
  return {
    mrr: c.mrr,
    activeContracts: c.active,
    coveredEquipment: ce.covered,
    avgTicket: c.active ? c.mrr / c.active : 0,
    todayCount: w.today,
    todayDone: w.todayDone,
    overdueOrders: w.overdue,
    oldestOverdue: w.oldestOverdue,
    overdueAmount: r.overdue,
    overdueCount: r.overdueCount,
    overdueRatio: monthBase > 0 ? r.overdue / monthBase : 0,
    next30: r.next30,
    next30Count: r.next30Count,
  };
}

export type Readouts = Awaited<ReturnType<typeof getReadouts>>;

/** Pendências que pedem uma decisão do dono. Cada consulta é um agregado pequeno. */
export async function getAttention(today: ISODate) {
  const in30 = addDays(today, 30);
  const [[w], [proofs], requests, pmocs, lowStock, issues] = await Promise.all([
    db
      .select({
        noTech: sql<number>`count(*) filter (where ${workOrders.status} = 'aberta' and ${workOrders.technicianId} is null and ${workOrders.origin} <> 'portal_cliente')::int`,
        noTechNext: sql<string | null>`(min(coalesce(${workOrders.scheduledDate}, ${workOrders.dueDate})) filter (where ${workOrders.status} = 'aberta' and ${workOrders.technicianId} is null and ${workOrders.origin} <> 'portal_cliente'))::text`,
        noTechFirst: sql<string | null>`((array_agg(${workOrders.id} order by coalesce(${workOrders.scheduledDate}, ${workOrders.dueDate}) nulls last) filter (where ${workOrders.status} = 'aberta' and ${workOrders.technicianId} is null and ${workOrders.origin} <> 'portal_cliente'))[1])::text`,
        portal: sql<number>`count(*) filter (where ${workOrders.status} = 'aberta' and ${workOrders.origin} = 'portal_cliente')::int`,
        portalOldest: sql<string | null>`to_char((min(${workOrders.createdAt}) filter (where ${workOrders.status} = 'aberta' and ${workOrders.origin} = 'portal_cliente')) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
        portalFirst: sql<string | null>`((array_agg(${workOrders.id} order by ${workOrders.createdAt}) filter (where ${workOrders.status} = 'aberta' and ${workOrders.origin} = 'portal_cliente'))[1])::text`,
      })
      .from(workOrders)
      .where(eq(workOrders.status, "aberta")),
    db
      .select({
        count: sql<number>`count(*)::int`,
        amount: sql<number>`coalesce(sum(${receivables.amount} - ${receivables.discount}), 0)::float8`,
      })
      .from(receivables)
      .where(eq(receivables.status, "em_analise")),
    db
      .select({ reason: purchaseRequests.reason, count: sql<number>`count(*)::int` })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.status, "aberta"))
      .groupBy(purchaseRequests.reason),
    // Último PMOC de cada cliente/local que vence em até 30 dias (ou já venceu sem renovação).
    db
      .select({
        id: pmocDocuments.id,
        validUntil: pmocDocuments.validUntil,
        customer: sql<string>`coalesce(${customers.tradeName}, ${customers.name})`,
      })
      .from(pmocDocuments)
      .innerJoin(customers, eq(customers.id, pmocDocuments.customerId))
      .where(
        and(
          lte(pmocDocuments.validUntil, in30),
          eq(customers.status, "ativo"),
          sql`not exists (
            select 1 from pmoc_documents p2
            where p2.customer_id = ${pmocDocuments.customerId}
              and p2.site_id is not distinct from ${pmocDocuments.siteId}
              and p2.valid_until > ${pmocDocuments.validUntil}
          )`,
        ),
      )
      .orderBy(asc(pmocDocuments.validUntil))
      .limit(20),
    db
      .select({
        id: products.id,
        name: products.name,
        unit: products.unit,
        total: sql<number>`coalesce(sum(${stockLevels.quantity}), 0)::float8`,
        min: products.minStock,
      })
      .from(products)
      .leftJoin(stockLevels, eq(stockLevels.productId, products.id))
      .where(and(eq(products.active, true), sql`${products.minStock} > 0`))
      .groupBy(products.id)
      .having(sql`coalesce(sum(${stockLevels.quantity}), 0) < ${products.minStock}`)
      .orderBy(sql`coalesce(sum(${stockLevels.quantity}), 0) / nullif(${products.minStock}, 0)`)
      .limit(20),
    generationIssues(),
  ]);

  return {
    noTech: { count: w?.noTech ?? 0, next: w?.noTechNext ?? null, firstId: w?.noTechFirst ?? null },
    portal: { count: w?.portal ?? 0, oldest: w?.portalOldest ?? null, firstId: w?.portalFirst ?? null },
    proofs: { count: proofs?.count ?? 0, amount: proofs?.amount ?? 0 },
    requests: Object.fromEntries(requests.map((r) => [r.reason, r.count])) as Record<string, number>,
    pmocs,
    lowStock: lowStock.map((p) => ({ ...p, min: Number(p.min) })),
    issues,
  };
}

export type Attention = Awaited<ReturnType<typeof getAttention>>;

/** OMs de hoje por técnico (ordem do dia). */
export async function getFieldToday(today: ISODate) {
  const [techs, absences, orders] = await Promise.all([
    db
      .select({ id: technicians.id, name: technicians.name, color: technicians.color })
      .from(technicians)
      .where(eq(technicians.active, true))
      .orderBy(asc(technicians.name)),
    db
      .select({ technicianId: technicianAbsences.technicianId, reason: technicianAbsences.reason })
      .from(technicianAbsences)
      .where(and(lte(technicianAbsences.startDate, today), gte(technicianAbsences.endDate, today))),
    db
      .select({
        id: workOrders.id,
        number: workOrders.number,
        status: workOrders.status,
        type: workOrders.type,
        title: workOrders.title,
        technicianId: workOrders.technicianId,
        time: sql<string | null>`to_char(${workOrders.scheduledTime}, 'HH24:MI')`,
        travelAt: sql<string | null>`to_char(${workOrders.travelStartedAt} at time zone '${sql.raw(TZ)}', 'YYYY-MM-DD HH24:MI')`,
        startedAt: sql<string | null>`to_char(${workOrders.startedAt} at time zone '${sql.raw(TZ)}', 'YYYY-MM-DD HH24:MI')`,
        finishedAt: sql<string | null>`to_char(${workOrders.finishedAt} at time zone '${sql.raw(TZ)}', 'YYYY-MM-DD HH24:MI')`,
        customer: sql<string>`coalesce(${customers.tradeName}, ${customers.name})`,
        minutes: maintenancePlans.estimatedMinutes,
        equipmentType: equipmentTypes.name,
        equipmentLocation: equipment.location,
      })
      .from(workOrders)
      .innerJoin(customers, eq(customers.id, workOrders.customerId))
      .leftJoin(maintenancePlans, eq(maintenancePlans.id, workOrders.maintenancePlanId))
      .leftJoin(equipment, eq(equipment.id, workOrders.equipmentId))
      .leftJoin(equipmentTypes, eq(equipmentTypes.id, equipment.typeId))
      .where(and(eq(workOrders.scheduledDate, today), ne(workOrders.status, "cancelada")))
      .orderBy(sql`${workOrders.scheduledTime} asc nulls last`, asc(workOrders.number)),
  ]);
  return { techs, absences, orders };
}

export type FieldToday = Awaited<ReturnType<typeof getFieldToday>>;
export type FieldOrder = FieldToday["orders"][number];

/** "2026-05" … "2026-10": os 6 meses terminando no mês de hoje. */
export function lastMonths(today: ISODate, n = 6) {
  return Array.from({ length: n }, (_, i) => addMonths(startOfMonth(today), i - (n - 1)).slice(0, 7));
}

/** Recebido por mês (data do pagamento, fuso de São Paulo), mensalidades x serviços. */
export async function getRevenueByMonth(today: ISODate) {
  const months = lastMonths(today);
  const start = `${months[0]}-01`;
  const month = sql<string>`to_char(${receivables.paidAt} at time zone '${sql.raw(TZ)}', 'YYYY-MM')`;
  const paid = sql`coalesce(${receivables.paidAmount}, ${receivables.amount})`;
  const rows = await db
    .select({
      month,
      recurring: sql<number>`coalesce(sum(${paid}) filter (where ${receivables.kind} = 'mensalidade'), 0)::float8`,
      services: sql<number>`coalesce(sum(${paid}) filter (where ${receivables.kind} <> 'mensalidade'), 0)::float8`,
    })
    .from(receivables)
    .where(
      and(
        eq(receivables.status, "pago"),
        sql`${receivables.paidAt} >= (${start}::date)::timestamp at time zone '${sql.raw(TZ)}'`,
      ),
    )
    .groupBy(month);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map((m) => ({
    month: m,
    recurring: byMonth.get(m)?.recurring ?? 0,
    services: byMonth.get(m)?.services ?? 0,
  }));
}

/** Preventivas (e PMOC) previstas x concluídas por mês do vencimento. */
export async function getPreventiveByMonth(today: ISODate) {
  const months = lastMonths(today);
  const start = `${months[0]}-01`;
  const end = endOfMonth(today);
  const due = sql`coalesce(${workOrders.dueDate}, ${workOrders.scheduledDate})`;
  const month = sql<string>`to_char(${due}, 'YYYY-MM')`;
  const rows = await db
    .select({
      month,
      planned: sql<number>`count(*) filter (where ${workOrders.status} <> 'cancelada')::int`,
      done: sql<number>`count(*) filter (where ${workOrders.status} = 'concluida')::int`,
      pastPlanned: sql<number>`count(*) filter (where ${workOrders.status} <> 'cancelada' and ${due} < ${today})::int`,
      pastDone: sql<number>`count(*) filter (where ${workOrders.status} = 'concluida' and ${due} < ${today})::int`,
    })
    .from(workOrders)
    .where(and(inArray(workOrders.type, [...PREVENTIVE_TYPES]), sql`${due} between ${start} and ${end}`))
    .groupBy(month);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const series = months.map((m) => ({
    month: m,
    planned: byMonth.get(m)?.planned ?? 0,
    done: byMonth.get(m)?.done ?? 0,
  }));
  const pastPlanned = rows.reduce((s, r) => s + r.pastPlanned, 0);
  const pastDone = rows.reduce((s, r) => s + r.pastDone, 0);
  return {
    series,
    pastPlanned,
    pastDone,
    pending: pastPlanned - pastDone,
    compliance: pastPlanned > 0 ? pastDone / pastPlanned : null,
  };
}

/** OMs ativas por técnico (carteira), com as atrasadas destacadas. */
export async function getOpenByTechnician(today: ISODate) {
  return db
    .select({
      technicianId: workOrders.technicianId,
      name: technicians.name,
      count: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) filter (where ${workOrders.scheduledDate} < ${today})::int`,
    })
    .from(workOrders)
    .leftJoin(technicians, eq(technicians.id, workOrders.technicianId))
    .where(inArray(workOrders.status, ACTIVE))
    .groupBy(workOrders.technicianId, technicians.name)
    .orderBy(desc(sql`count(*)`), asc(technicians.name));
}

export type RoutineSummary = {
  mensalidades?: number;
  oms?: number;
  equipamentosVerificados?: number;
  bloqueadosPorInadimplencia?: number;
  omsSemTecnico?: number;
  solicitacoesCompra?: number;
  erros?: { contractEquipmentId: string; message: string }[];
};

/** Última execução da rotina diária (mensalidades, OMs preventivas, reposição). */
export async function getRoutineStatus() {
  const [settings, [run]] = await Promise.all([
    getSettings(),
    db.select().from(jobRuns).where(eq(jobRuns.job, "diario")).orderBy(desc(jobRuns.startedAt)).limit(1),
  ]);
  let summary: RoutineSummary | null = null;
  let failure: string | null = null;
  if (run?.summary) {
    try {
      summary = JSON.parse(run.summary) as RoutineSummary;
    } catch {
      failure = run.summary;
    }
  }
  if (run && run.ok === false && !failure && !summary?.erros?.length) failure = "A rotina terminou com erro.";
  const lastRunAt = settings.lastDailyRunAt ?? run?.finishedAt ?? null;
  const now = Date.now();
  return {
    lastRunAt,
    /** Mais de 26 h sem rodar: o agendamento diário pode ter parado. */
    stale: !lastRunAt || now - lastRunAt.getTime() > 26 * 3_600_000,
    /** Começou há menos de 10 min e ainda não terminou. */
    running: Boolean(run && !run.finishedAt && now - run.startedAt.getTime() < 10 * 60_000),
    run: run
      ? {
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          ok: run.ok,
          triggeredBy: run.triggeredBy,
        }
      : null,
    summary,
    failure,
  };
}

export type RoutineStatus = Awaited<ReturnType<typeof getRoutineStatus>>;

