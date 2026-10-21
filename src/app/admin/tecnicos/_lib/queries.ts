import "server-only";
import { and, asc, desc, eq, getTableColumns, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commissionEntries,
  customers,
  products,
  session,
  stockLevels,
  stockLocations,
  technicianAbsences,
  technicians,
  user,
  workOrders,
} from "@/db/schema";
import { addCompetence, addDays, competenceOf, endOfMonth, startOfMonth, todayISO } from "@/lib/dates";
import { activeWorkOrderStatuses } from "@/lib/labels";

/** Data de calendário (São Paulo) de um timestamp. */
const spDate = (col: typeof workOrders.finishedAt) => sql`(${col} at time zone 'America/Sao_Paulo')::date`;

/** Dia de referência da OM no mês: data agendada ou, na falta, a data de conclusão. */
const woDay = sql`coalesce(${workOrders.scheduledDate}, ${spDate(workOrders.finishedAt)})`;

export type TeamRow = Awaited<ReturnType<typeof listTeam>>[number];

export async function listTeam() {
  const today = todayISO();
  const month = competenceOf(today);
  const start = startOfMonth(today);
  const end = endOfMonth(today);

  const [techs, monthStats, ratings, commissions] = await Promise.all([
    db
      .select({ ...getTableColumns(technicians), loginEmail: user.email, banned: user.banned })
      .from(technicians)
      .leftJoin(user, eq(user.id, technicians.userId))
      .orderBy(desc(technicians.active), asc(technicians.name)),
    db
      .select({
        technicianId: workOrders.technicianId,
        total: sql<number>`count(*)::int`,
        done: sql<number>`(count(*) filter (where ${workOrders.status} = 'concluida'))::int`,
      })
      .from(workOrders)
      .where(
        and(
          isNotNull(workOrders.technicianId),
          ne(workOrders.status, "cancelada"),
          sql`${woDay} between ${start} and ${end}`,
        ),
      )
      .groupBy(workOrders.technicianId),
    db
      .select({
        technicianId: workOrders.technicianId,
        avg: sql<number>`avg(${workOrders.rating})::float`,
        count: sql<number>`count(${workOrders.rating})::int`,
      })
      .from(workOrders)
      .where(and(isNotNull(workOrders.technicianId), isNotNull(workOrders.rating)))
      .groupBy(workOrders.technicianId),
    db
      .select({
        technicianId: commissionEntries.technicianId,
        total: sql<number>`coalesce(sum(${commissionEntries.amount}), 0)::float`,
      })
      .from(commissionEntries)
      .where(and(eq(commissionEntries.period, month), ne(commissionEntries.status, "cancelada")))
      .groupBy(commissionEntries.technicianId),
  ]);

  const byTech = <T extends { technicianId: string | null }>(rows: T[]) =>
    new Map(rows.map((r) => [r.technicianId, r] as const));
  const ms = byTech(monthStats);
  const rt = byTech(ratings);
  const cm = byTech(commissions);

  return techs.map((t) => ({
    ...t,
    monthTotal: ms.get(t.id)?.total ?? 0,
    monthDone: ms.get(t.id)?.done ?? 0,
    ratingAvg: rt.get(t.id)?.avg ?? null,
    ratingCount: rt.get(t.id)?.count ?? 0,
    commissionMonth: cm.get(t.id)?.total ?? 0,
  }));
}

export async function getTechnician(id: string) {
  const [row] = await db
    .select({
      ...getTableColumns(technicians),
      loginEmail: user.email,
      banned: user.banned,
      banReason: user.banReason,
    })
    .from(technicians)
    .leftJoin(user, eq(user.id, technicians.userId))
    .where(eq(technicians.id, id))
    .limit(1);
  return row ?? null;
}

export async function getProfileStats(technicianId: string) {
  const today = todayISO();
  const month = competenceOf(today);
  const start = startOfMonth(today);
  const end = endOfMonth(today);
  const since90 = addDays(today, -90);

  const [[done], [duration], [rating], [comm]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.technicianId, technicianId),
          eq(workOrders.status, "concluida"),
          sql`${spDate(workOrders.finishedAt)} between ${start} and ${end}`,
        ),
      ),
    db
      .select({
        minutes: sql<number | null>`avg(extract(epoch from (${workOrders.finishedAt} - ${workOrders.startedAt})) / 60)::float`,
        n: sql<number>`count(*)::int`,
      })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.technicianId, technicianId),
          eq(workOrders.status, "concluida"),
          isNotNull(workOrders.startedAt),
          isNotNull(workOrders.finishedAt),
          sql`${workOrders.finishedAt} > ${workOrders.startedAt}`,
          sql`${spDate(workOrders.finishedAt)} >= ${since90}`,
        ),
      ),
    db
      .select({
        avg: sql<number | null>`avg(${workOrders.rating})::float`,
        n: sql<number>`count(${workOrders.rating})::int`,
      })
      .from(workOrders)
      .where(and(eq(workOrders.technicianId, technicianId), isNotNull(workOrders.rating))),
    db
      .select({
        month: sql<number>`coalesce(sum(${commissionEntries.amount}) filter (where ${commissionEntries.period} = ${month} and ${commissionEntries.status} <> 'cancelada'), 0)::float`,
        toReceive: sql<number>`coalesce(sum(${commissionEntries.amount}) filter (where ${commissionEntries.status} = 'aprovada' and ${commissionEntries.payoutId} is null), 0)::float`,
        pending: sql<number>`coalesce(sum(${commissionEntries.amount}) filter (where ${commissionEntries.status} = 'pendente'), 0)::float`,
      })
      .from(commissionEntries)
      .where(eq(commissionEntries.technicianId, technicianId)),
  ]);

  return {
    doneMonth: done?.n ?? 0,
    avgMinutes: duration?.minutes ?? null,
    durationSample: duration?.n ?? 0,
    ratingAvg: rating?.avg ?? null,
    ratingCount: rating?.n ?? 0,
    commissionMonth: comm?.month ?? 0,
    commissionToReceive: comm?.toReceive ?? 0,
    commissionPending: comm?.pending ?? 0,
  };
}

/** Próximas OMs (inclui as atrasadas ainda em aberto, que aparecem primeiro). */
export async function upcomingWorkOrders(technicianId: string, limit = 10) {
  return db
    .select({
      id: workOrders.id,
      number: workOrders.number,
      title: workOrders.title,
      type: workOrders.type,
      status: workOrders.status,
      priority: workOrders.priority,
      scheduledDate: workOrders.scheduledDate,
      scheduledTime: workOrders.scheduledTime,
      dueDate: workOrders.dueDate,
      customerName: customers.name,
    })
    .from(workOrders)
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .where(and(eq(workOrders.technicianId, technicianId), inArray(workOrders.status, [...activeWorkOrderStatuses])))
    .orderBy(sql`${workOrders.scheduledDate} asc nulls last`, sql`${workOrders.scheduledTime} asc nulls last`, asc(workOrders.number))
    .limit(limit);
}

export async function recentCompleted(technicianId: string, limit = 10) {
  return db
    .select({
      id: workOrders.id,
      number: workOrders.number,
      title: workOrders.title,
      type: workOrders.type,
      startedAt: workOrders.startedAt,
      finishedAt: workOrders.finishedAt,
      rating: workOrders.rating,
      customerName: customers.name,
      commission: commissionEntries.amount,
      commissionStatus: commissionEntries.status,
    })
    .from(workOrders)
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .leftJoin(
      commissionEntries,
      and(eq(commissionEntries.workOrderId, workOrders.id), eq(commissionEntries.technicianId, technicianId)),
    )
    .where(and(eq(workOrders.technicianId, technicianId), eq(workOrders.status, "concluida")))
    .orderBy(sql`${workOrders.finishedAt} desc nulls last`)
    .limit(limit);
}

/** Ausências recentes e futuras, com quantas OMs ativas já estão agendadas no período. */
export async function listAbsences(technicianId: string) {
  const since = addDays(todayISO(), -120);
  const rows = await db
    .select({
      ...getTableColumns(technicianAbsences),
      scheduledInside: sql<number>`(
        select count(*)::int from ${workOrders}
        where ${workOrders.technicianId} = ${technicianAbsences.technicianId}
          and ${workOrders.status} in ('aberta','agendada','em_deslocamento','em_execucao','pausada','aguardando_material')
          and ${workOrders.scheduledDate} between ${technicianAbsences.startDate} and ${technicianAbsences.endDate}
      )`,
    })
    .from(technicianAbsences)
    .where(and(eq(technicianAbsences.technicianId, technicianId), gte(technicianAbsences.endDate, since)))
    .orderBy(desc(technicianAbsences.startDate));
  return rows;
}

export async function vehicleStock(technicianId: string) {
  const locations = await db.query.stockLocations.findMany({
    where: and(eq(stockLocations.technicianId, technicianId), eq(stockLocations.type, "veiculo")),
    orderBy: [desc(stockLocations.active), asc(stockLocations.name)],
  });
  if (!locations.length) return { locations, items: [] };
  const items = await db
    .select({
      locationId: stockLevels.locationId,
      productId: products.id,
      name: products.name,
      sku: products.sku,
      unit: products.unit,
      category: products.category,
      quantity: stockLevels.quantity,
    })
    .from(stockLevels)
    .innerJoin(products, eq(products.id, stockLevels.productId))
    .where(and(inArray(stockLevels.locationId, locations.map((l) => l.id)), ne(stockLevels.quantity, 0)))
    .orderBy(asc(products.name));
  return { locations, items };
}

export async function lastLogin(userId: string | null) {
  if (!userId) return null;
  const [row] = await db
    .select({ at: sql<Date | null>`max(${session.createdAt})` })
    .from(session)
    .where(eq(session.userId, userId));
  return row?.at ? new Date(row.at) : null;
}

/** Desempenho: OMs concluídas por mês (últimos 6) e por tipo no mesmo período. */
export async function performance(technicianId: string) {
  const current = competenceOf(todayISO());
  const months = Array.from({ length: 6 }, (_, i) => addCompetence(current, i - 5));
  const from = `${months[0]}-01`;
  const monthKey = sql<string>`to_char(${workOrders.finishedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM')`;
  const base = and(
    eq(workOrders.technicianId, technicianId),
    eq(workOrders.status, "concluida"),
    sql`${spDate(workOrders.finishedAt)} >= ${from}`,
  );
  const [perMonth, perType] = await Promise.all([
    db.select({ month: monthKey, n: sql<number>`count(*)::int` }).from(workOrders).where(base).groupBy(monthKey),
    db
      .select({ type: workOrders.type, n: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(base)
      .groupBy(workOrders.type)
      .orderBy(desc(sql`count(*)`)),
  ]);
  const map = new Map(perMonth.map((r) => [r.month, r.n]));
  return {
    months: months.map((m) => ({ month: m, done: map.get(m) ?? 0 })),
    perType,
  };
}

/** Nomes de técnicos (selects). */
export async function technicianOptions() {
  return db
    .select({ id: technicians.id, name: technicians.name, color: technicians.color, active: technicians.active })
    .from(technicians)
    .orderBy(desc(technicians.active), asc(technicians.name));
}

