import "server-only";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { commissionEntries, commissionPayouts, commissionRules, payables, technicians, workOrders } from "@/db/schema";
import { PAGE_SIZE } from "@/lib/params";

export async function statement({
  period,
  technicianId,
  page,
}: {
  period: string;
  technicianId?: string;
  page: number;
}) {
  const where = and(
    eq(commissionEntries.period, period),
    technicianId ? eq(commissionEntries.technicianId, technicianId) : undefined,
  );
  const [rows, [{ total }], byStatus] = await Promise.all([
    db
      .select({
        id: commissionEntries.id,
        technicianId: commissionEntries.technicianId,
        technicianName: technicians.name,
        technicianColor: technicians.color,
        workOrderId: commissionEntries.workOrderId,
        number: workOrders.number,
        type: workOrders.type,
        title: workOrders.title,
        finishedAt: workOrders.finishedAt,
        basis: commissionEntries.basis,
        baseAmount: commissionEntries.baseAmount,
        rate: commissionEntries.rate,
        amount: commissionEntries.amount,
        status: commissionEntries.status,
        payoutId: commissionEntries.payoutId,
      })
      .from(commissionEntries)
      .innerJoin(technicians, eq(technicians.id, commissionEntries.technicianId))
      .leftJoin(workOrders, eq(workOrders.id, commissionEntries.workOrderId))
      .where(where)
      .orderBy(sql`${workOrders.finishedAt} desc nulls last`, desc(workOrders.number))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(commissionEntries).where(where),
    db
      .select({
        status: commissionEntries.status,
        count: sql<number>`count(*)::int`,
        amount: sql<number>`coalesce(sum(${commissionEntries.amount}), 0)::float`,
        inPayout: sql<number>`coalesce(sum(${commissionEntries.amount}) filter (where ${commissionEntries.payoutId} is not null), 0)::float`,
      })
      .from(commissionEntries)
      .where(where)
      .groupBy(commissionEntries.status),
  ]);
  const totals = Object.fromEntries(
    byStatus.map((s) => [s.status, { count: s.count, amount: s.amount, inPayout: s.inPayout }]),
  ) as Record<string, { count: number; amount: number; inPayout: number } | undefined>;
  return { rows, total, totals };
}

export type TechSummary = Awaited<ReturnType<typeof summaryByTechnician>>[number];

/** Resumo do período por técnico e quanto há para fechar (liberadas até o período, fora de fechamento). */
export async function summaryByTechnician(period: string, technicianId?: string) {
  const e = commissionEntries;
  const inPeriod = sql`${e.period} = ${period}`;
  const sum = (cond: SQL) => sql<number>`coalesce(sum(${e.amount}) filter (where ${cond}), 0)::float`;
  const rows = await db
    .select({
      id: technicians.id,
      name: technicians.name,
      color: technicians.color,
      active: technicians.active,
      count: sql<number>`(count(${e.id}) filter (where ${inPeriod} and ${e.status} <> 'cancelada'))::int`,
      pending: sum(sql`${inPeriod} and ${e.status} = 'pendente'`),
      released: sum(sql`${inPeriod} and ${e.status} = 'aprovada'`),
      paid: sum(sql`${inPeriod} and ${e.status} = 'paga'`),
      total: sum(sql`${inPeriod} and ${e.status} <> 'cancelada'`),
      toClose: sum(sql`${e.period} <= ${period} and ${e.status} = 'aprovada' and ${e.payoutId} is null`),
      toCloseCount: sql<number>`(count(${e.id}) filter (where ${e.period} <= ${period} and ${e.status} = 'aprovada' and ${e.payoutId} is null))::int`,
      toCloseEarlier: sum(sql`${e.period} < ${period} and ${e.status} = 'aprovada' and ${e.payoutId} is null`),
    })
    .from(technicians)
    .leftJoin(e, eq(e.technicianId, technicians.id))
    .where(technicianId ? eq(technicians.id, technicianId) : undefined)
    .groupBy(technicians.id)
    .orderBy(desc(technicians.active), asc(technicians.name));

  const payouts = await db
    .select({
      technicianId: commissionPayouts.technicianId,
      id: commissionPayouts.id,
      status: commissionPayouts.status,
      totalAmount: commissionPayouts.totalAmount,
    })
    .from(commissionPayouts)
    .where(and(eq(commissionPayouts.period, period), sql`${commissionPayouts.status} <> 'cancelado'`));
  const byTech = new Map<string, typeof payouts>();
  for (const p of payouts) byTech.set(p.technicianId, [...(byTech.get(p.technicianId) ?? []), p]);

  return rows
    .filter((r) => r.active || r.total > 0 || r.toClose > 0 || byTech.has(r.id))
    .map((r) => ({ ...r, payouts: byTech.get(r.id) ?? [] }));
}

export async function payoutList({ technicianId, page }: { technicianId?: string; page: number }) {
  const where = technicianId ? eq(commissionPayouts.technicianId, technicianId) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: commissionPayouts.id,
        technicianId: commissionPayouts.technicianId,
        technicianName: technicians.name,
        technicianColor: technicians.color,
        period: commissionPayouts.period,
        totalAmount: commissionPayouts.totalAmount,
        status: commissionPayouts.status,
        paidAt: commissionPayouts.paidAt,
        createdAt: commissionPayouts.createdAt,
        payableId: commissionPayouts.payableId,
        payableStatus: payables.status,
        payableDueDate: payables.dueDate,
        entries: sql<number>`(select count(*)::int from commission_entries ce where ce.payout_id = commission_payouts.id)`,
      })
      .from(commissionPayouts)
      .innerJoin(technicians, eq(technicians.id, commissionPayouts.technicianId))
      .leftJoin(payables, eq(payables.id, commissionPayouts.payableId))
      .where(where)
      .orderBy(desc(commissionPayouts.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(commissionPayouts).where(where),
  ]);
  return { rows, total };
}

export async function rulesWithUsage() {
  return db
    .select({
      id: commissionRules.id,
      name: commissionRules.name,
      technicianId: commissionRules.technicianId,
      workOrderType: commissionRules.workOrderType,
      basis: commissionRules.basis,
      rate: commissionRules.rate,
      priority: commissionRules.priority,
      active: commissionRules.active,
      // nomes explícitos: num select de uma tabela só o Drizzle não qualifica as colunas da subconsulta
      usage: sql<number>`(select count(*)::int from commission_entries ce where ce.rule_id = commission_rules.id and ce.status <> 'cancelada')`,
    })
    .from(commissionRules)
    .orderBy(desc(commissionRules.active), asc(commissionRules.name));
}
