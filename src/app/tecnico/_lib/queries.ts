import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commissionEntries,
  contractEquipment,
  products,
  stockLevels,
  workOrders,
} from "@/db/schema";
import { addCompetence, addDays, competenceOf, endOfMonth, startOfMonth } from "@/lib/dates";
import { ACTIVE_STATUSES, type WorkOrderStatus } from "@/server/core/work-order-flow";
import { upcomingVisits, visitIntervalMonths } from "@/server/core/schedule";
import { defaultLocationFor } from "@/server/stock";

const ACTIVE = ACTIVE_STATUSES as WorkOrderStatus[];
const byTimeThenCreation = [
  asc(workOrders.scheduledDate),
  sql`${workOrders.scheduledTime} asc nulls last`,
  asc(workOrders.createdAt),
];

/** Colunas e relações usadas nos "tickets" de OM (Hoje e Agenda). */
const ticketWith = {
  customer: { columns: { name: true, tradeName: true } },
  site: true,
  equipment: { columns: { id: true, location: true, brand: true, model: true }, with: { type: { columns: { name: true } } } },
  tasks: { columns: { id: true, done: true } },
  plan: { columns: { estimatedMinutes: true } },
} as const;

async function ticketsWhere(where: ReturnType<typeof and>) {
  return db.query.workOrders.findMany({ where, with: ticketWith, orderBy: byTimeThenCreation });
}

export type TicketRow = Awaited<ReturnType<typeof ticketsWhere>>[number];

/** OMs de hoje + OMs ativas atrasadas de dias anteriores (no topo). */
export async function todayBoard(technicianId: string, today: string) {
  return ticketsWhere(
    and(
      eq(workOrders.technicianId, technicianId),
      ne(workOrders.status, "cancelada"),
      or(
        eq(workOrders.scheduledDate, today),
        and(lt(workOrders.scheduledDate, today), inArray(workOrders.status, ACTIVE)),
      ),
    ),
  );
}

/** Próximos dias (inclui hoje) e OMs ativas sem data. */
export async function agendaBoard(technicianId: string, from: string, to: string) {
  const [dated, undated] = await Promise.all([
    ticketsWhere(
      and(
        eq(workOrders.technicianId, technicianId),
        ne(workOrders.status, "cancelada"),
        gte(workOrders.scheduledDate, from),
        lte(workOrders.scheduledDate, to),
      ),
    ),
    ticketsWhere(
      and(eq(workOrders.technicianId, technicianId), isNull(workOrders.scheduledDate), inArray(workOrders.status, ACTIVE)),
    ),
  ]);
  return { dated, undated };
}

export async function countOn(technicianId: string, date: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(and(eq(workOrders.technicianId, technicianId), eq(workOrders.scheduledDate, date), inArray(workOrders.status, ACTIVE)));
  return row?.n ?? 0;
}

/** OMs concluídas no mês e comissão do mês (exceto canceladas). */
export async function monthSummary(technicianId: string, today: string) {
  const start = startOfMonth(today);
  const end = endOfMonth(today);
  const [[done], [commission]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.technicianId, technicianId),
          eq(workOrders.status, "concluida"),
          sql`(${workOrders.finishedAt} at time zone 'America/Sao_Paulo')::date between ${start} and ${end}`,
        ),
      ),
    db
      .select({ total: sql<number>`coalesce(sum(${commissionEntries.amount}), 0)::float` })
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.technicianId, technicianId),
          eq(commissionEntries.period, competenceOf(today)),
          ne(commissionEntries.status, "cancelada"),
        ),
      ),
  ]);
  return { concluded: done?.n ?? 0, commission: Number(commission?.total ?? 0) };
}

/** Próxima OM ativa do dia (para o botão "Próxima OM"). */
export async function nextWorkOrderId(technicianId: string, today: string, excludeId?: string) {
  const rows = await db.query.workOrders.findMany({
    where: and(
      eq(workOrders.technicianId, technicianId),
      inArray(workOrders.status, ACTIVE),
      lte(workOrders.scheduledDate, today),
      excludeId ? ne(workOrders.id, excludeId) : undefined,
    ),
    columns: { id: true },
    orderBy: byTimeThenCreation,
    limit: 1,
  });
  return rows[0]?.id ?? null;
}

/** Tudo o que a tela de execução precisa — ou null se a OM não for do técnico. */
export async function workOrderForTechnician(id: string, technicianId: string) {
  const wo = await db.query.workOrders.findFirst({
    where: eq(workOrders.id, id),
    with: {
      customer: { columns: { id: true, name: true, tradeName: true, phone: true, whatsapp: true } },
      site: true,
      equipment: { with: { type: true } },
      tasks: { orderBy: (t, { asc }) => [asc(t.position)] },
      photos: { orderBy: (p, { asc }) => [asc(p.createdAt)] },
      materials: { with: { product: true }, orderBy: (m, { asc }) => [asc(m.createdAt)] },
      plan: { columns: { name: true, estimatedMinutes: true } },
    },
  });
  if (!wo || wo.technicianId !== technicianId) return null;

  const [previous, location, catalog, commission] = await Promise.all([
    wo.equipmentId
      ? db.query.workOrders.findFirst({
          where: and(eq(workOrders.equipmentId, wo.equipmentId), eq(workOrders.status, "concluida"), ne(workOrders.id, wo.id)),
          columns: { id: true, number: true, finishedAt: true, scheduledDate: true, solution: true, type: true },
          with: { technician: { columns: { name: true } } },
          orderBy: [desc(workOrders.finishedAt)],
        })
      : null,
    defaultLocationFor(db, technicianId),
    db.query.products.findMany({
      where: eq(products.active, true),
      columns: { id: true, name: true, unit: true, category: true, salePrice: true, sku: true },
      orderBy: [asc(products.name)],
    }),
    wo.status === "concluida"
      ? db.query.commissionEntries.findFirst({
          where: and(eq(commissionEntries.workOrderId, wo.id), eq(commissionEntries.technicianId, technicianId), ne(commissionEntries.status, "cancelada")),
          columns: { amount: true, status: true },
        })
      : null,
  ]);
  const levels = await db
    .select({ productId: stockLevels.productId, quantity: stockLevels.quantity })
    .from(stockLevels)
    .where(eq(stockLevels.locationId, location.id));
  return { wo, previous: previous ?? null, location, catalog, levels, commission: commission ?? null };
}

/** Estoque do veículo do técnico. */
export async function vehicleStock(technicianId: string) {
  const location = await defaultLocationFor(db, technicianId);
  const rows = await db.query.stockLevels.findMany({
    where: eq(stockLevels.locationId, location.id),
    with: { product: { columns: { id: true, name: true, unit: true, category: true, minStock: true } } },
  });
  return {
    location,
    rows: rows
      .filter((r) => r.quantity !== 0)
      .sort((a, b) => a.product.name.localeCompare(b.product.name, "pt-BR")),
  };
}

/** Ficha do equipamento para o técnico: dados, as OMs DELE em aberto, histórico e previsão. */
export async function equipmentForTechnician(id: string, technicianId: string, today: string) {
  const eq_ = await db.query.equipment.findFirst({
    where: (e, { eq }) => eq(e.id, id),
    with: { type: true, customer: { columns: { id: true, name: true, tradeName: true } }, site: true },
  });
  if (!eq_) return null;
  const [mine, history, link] = await Promise.all([
    db.query.workOrders.findMany({
      where: and(eq(workOrders.equipmentId, id), eq(workOrders.technicianId, technicianId), inArray(workOrders.status, ACTIVE)),
      columns: { id: true, number: true, title: true, status: true, type: true, scheduledDate: true, scheduledTime: true },
      orderBy: byTimeThenCreation,
    }),
    db.query.workOrders.findMany({
      where: and(eq(workOrders.equipmentId, id), eq(workOrders.status, "concluida")),
      columns: { id: true, number: true, type: true, finishedAt: true, solution: true, technicianId: true },
      with: {
        technician: { columns: { name: true } },
        tasks: { columns: { title: true, measurementUnit: true, measurementValue: true }, orderBy: (t, { asc }) => [asc(t.position)] },
      },
      orderBy: [desc(workOrders.finishedAt)],
      limit: 10,
    }),
    db.query.contractEquipment.findFirst({
      where: and(eq(contractEquipment.equipmentId, id), eq(contractEquipment.active, true)),
      with: { plan: { with: { tasks: { columns: { frequencyMonths: true } } } }, contract: { columns: { status: true, name: true } } },
    }),
  ]);
  let forecast: string[] = [];
  if (link && link.contract.status === "ativo") {
    const interval = visitIntervalMonths(link.plan.tasks);
    forecast = upcomingVisits(link.anchorDate, interval, addDays(today, 1), 3);
  }
  return { equipment: eq_, mine, history, plan: link?.plan ?? null, forecast };
}

/** Ganhos: lançamentos do mês, totais por status e os últimos 6 meses. */
export async function earnings(technicianId: string, period: string) {
  const first = addCompetence(period, -5);
  const [entries, months] = await Promise.all([
    db.query.commissionEntries.findMany({
      where: and(eq(commissionEntries.technicianId, technicianId), eq(commissionEntries.period, period), ne(commissionEntries.status, "cancelada")),
      with: {
        workOrder: {
          columns: { id: true, number: true, type: true, finishedAt: true, title: true },
          with: { customer: { columns: { name: true, tradeName: true } } },
        },
      },
      orderBy: [desc(commissionEntries.createdAt)],
    }),
    db
      .select({ period: commissionEntries.period, total: sql<number>`coalesce(sum(${commissionEntries.amount}), 0)::float` })
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.technicianId, technicianId),
          gte(commissionEntries.period, first),
          lte(commissionEntries.period, period),
          ne(commissionEntries.status, "cancelada"),
        ),
      )
      .groupBy(commissionEntries.period),
  ]);
  const totals = { pendente: 0, aprovada: 0, paga: 0 };
  for (const e of entries) if (e.status in totals) totals[e.status as keyof typeof totals] += e.amount;
  const byPeriod = new Map(months.map((m) => [m.period, Number(m.total)]));
  const series = Array.from({ length: 6 }, (_, i) => {
    const p = addCompetence(first, i);
    return { period: p, total: Math.round((byPeriod.get(p) ?? 0) * 100) / 100 };
  });
  return { entries, totals, series };
}

/** Nome curto do cliente (nome fantasia quando houver). */
export function customerName(c: { name: string; tradeName?: string | null } | null | undefined) {
  if (!c) return "Cliente";
  return c.tradeName?.trim() || c.name;
}

/** Há outra OM minha no mesmo endereço em execução, pausada ou concluída hoje (estou no local)? */
export async function isAtSite(technicianId: string, siteId: string | null, excludeId: string) {
  if (!siteId) return false;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.technicianId, technicianId),
        eq(workOrders.siteId, siteId),
        ne(workOrders.id, excludeId),
        or(
          inArray(workOrders.status, ["em_execucao", "pausada"]),
          and(
            eq(workOrders.status, "concluida"),
            sql`(${workOrders.finishedAt} at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date`,
          ),
        ),
      ),
    );
  return (row?.n ?? 0) > 0;
}
