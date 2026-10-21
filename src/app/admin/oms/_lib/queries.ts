import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  equipment,
  equipmentTypes,
  stockLevels,
  stockLocations,
  products,
  technicians,
  workOrders,
} from "@/db/schema";
import { ACTIVE_STATUSES } from "@/server/core/work-order-flow";
import { todayISO } from "@/lib/dates";
import { PAGE_SIZE } from "@/lib/params";
import { isISODate, isUuid, parseOmNumber, type StatusGroup } from "./constants";

export type OmListFilters = {
  q?: string;
  status?: string;
  tipo?: string;
  tecnico?: string;
  de?: string;
  ate?: string;
  origem?: string;
  filtro?: string;
  page: number;
};

const TYPES = ["preventiva", "corretiva", "instalacao", "visita_tecnica", "pmoc"] as const;
const ORIGINS = ["manual", "automatica", "portal_cliente"] as const;

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function groupCondition(group: string | undefined): SQL | undefined {
  switch (group as StatusGroup) {
    case "sem-tecnico":
      return or(
        eq(workOrders.status, "aberta"),
        and(inArray(workOrders.status, ACTIVE_STATUSES), isNull(workOrders.technicianId)),
      );
    case "agendadas":
      return eq(workOrders.status, "agendada");
    case "em-campo":
      return inArray(workOrders.status, ["em_deslocamento", "em_execucao", "pausada"]);
    case "aguardando":
      return eq(workOrders.status, "aguardando_material");
    case "concluidas":
      return eq(workOrders.status, "concluida");
    case "canceladas":
      return eq(workOrders.status, "cancelada");
    default:
      return undefined;
  }
}

/** Condições de todos os filtros, menos o grupo de status (usado nas contagens das abas). */
function baseConditions(f: OmListFilters, today: string): SQL[] {
  const conds: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    const n = parseOmNumber(q);
    conds.push(
      or(
        ilike(workOrders.title, like),
        ilike(customers.name, like),
        ilike(customers.tradeName, like),
        n != null ? eq(workOrders.number, n) : undefined,
      )!,
    );
  }
  if (f.tipo && (TYPES as readonly string[]).includes(f.tipo)) {
    conds.push(eq(workOrders.type, f.tipo as (typeof TYPES)[number]));
  }
  if (f.origem && (ORIGINS as readonly string[]).includes(f.origem)) {
    conds.push(eq(workOrders.origin, f.origem as (typeof ORIGINS)[number]));
  }
  if (f.tecnico === "nenhum") conds.push(isNull(workOrders.technicianId));
  else if (isUuid(f.tecnico)) conds.push(eq(workOrders.technicianId, f.tecnico));
  if (isISODate(f.de)) conds.push(gte(workOrders.scheduledDate, f.de));
  if (isISODate(f.ate)) conds.push(lte(workOrders.scheduledDate, f.ate));
  if (f.filtro === "atrasadas") {
    conds.push(inArray(workOrders.status, ACTIVE_STATUSES), lt(workOrders.scheduledDate, today));
  }
  return conds;
}

export type OmListRow = Awaited<ReturnType<typeof listWorkOrders>>["rows"][number];

export async function listWorkOrders(f: OmListFilters) {
  const today = todayISO();
  const base = baseConditions(f, today);
  const group = groupCondition(f.status);
  const where = and(...base, group);

  const finalGroup = f.status === "concluidas" || f.status === "canceladas" || !f.status;
  const orderBy = finalGroup
    ? [desc(workOrders.number)]
    : [sql`${workOrders.scheduledDate} asc nulls first`, sql`${workOrders.scheduledTime} asc nulls last`, asc(workOrders.number)];

  const fromJoined = () =>
    db
      .select({
        id: workOrders.id,
        number: workOrders.number,
        type: workOrders.type,
        status: workOrders.status,
        priority: workOrders.priority,
        origin: workOrders.origin,
        title: workOrders.title,
        scheduledDate: workOrders.scheduledDate,
        scheduledTime: workOrders.scheduledTime,
        dueDate: workOrders.dueDate,
        customerId: workOrders.customerId,
        customerName: customers.name,
        customerTradeName: customers.tradeName,
        equipmentId: workOrders.equipmentId,
        equipmentType: equipmentTypes.name,
        equipmentLocation: equipment.location,
        equipmentBrand: equipment.brand,
        technicianId: workOrders.technicianId,
        technicianName: technicians.name,
        technicianColor: technicians.color,
      })
      .from(workOrders)
      .innerJoin(customers, eq(customers.id, workOrders.customerId))
      .leftJoin(equipment, eq(equipment.id, workOrders.equipmentId))
      .leftJoin(equipmentTypes, eq(equipmentTypes.id, equipment.typeId))
      .leftJoin(technicians, eq(technicians.id, workOrders.technicianId));

  const g = (name: string) => groupCondition(name)!;
  const [rows, [counts]] = await Promise.all([
    fromJoined()
      .where(where)
      .orderBy(...orderBy)
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db
      .select({
        total: sql<number>`count(*)::int`,
        semTecnico: sql<number>`(count(*) filter (where ${g("sem-tecnico")}))::int`,
        agendadas: sql<number>`(count(*) filter (where ${g("agendadas")}))::int`,
        emCampo: sql<number>`(count(*) filter (where ${g("em-campo")}))::int`,
        aguardando: sql<number>`(count(*) filter (where ${g("aguardando")}))::int`,
        concluidas: sql<number>`(count(*) filter (where ${g("concluidas")}))::int`,
        canceladas: sql<number>`(count(*) filter (where ${g("canceladas")}))::int`,
      })
      .from(workOrders)
      .innerJoin(customers, eq(customers.id, workOrders.customerId))
      .where(and(...base)),
  ]);

  const groupTotal: Record<string, number> = {
    "sem-tecnico": counts.semTecnico,
    agendadas: counts.agendadas,
    "em-campo": counts.emCampo,
    aguardando: counts.aguardando,
    concluidas: counts.concluidas,
    canceladas: counts.canceladas,
    "": counts.total,
  };

  return {
    rows: rows.map((r) => ({
      ...r,
      late:
        (ACTIVE_STATUSES as readonly string[]).includes(r.status) && !!r.scheduledDate && r.scheduledDate < today,
    })),
    counts: groupTotal,
    total: groupTotal[f.status ?? ""] ?? counts.total,
    today,
  };
}

export async function countOverdue() {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(and(inArray(workOrders.status, ACTIVE_STATUSES), lt(workOrders.scheduledDate, todayISO())));
  return r?.n ?? 0;
}

export async function activeTechnicians() {
  return db.query.technicians.findMany({
    where: eq(technicians.active, true),
    columns: { id: true, name: true, color: true },
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

export async function allTechnicians() {
  return db.query.technicians.findMany({
    columns: { id: true, name: true, color: true, active: true },
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

/** Locais de estoque ativos com o saldo de cada produto ativo (para lançar material na OM). */
export async function materialOptions() {
  const [prods, locations, levels] = await Promise.all([
    db.query.products.findMany({
      where: eq(products.active, true),
      columns: { id: true, name: true, sku: true, unit: true, salePrice: true, category: true },
      orderBy: (p, { asc }) => [asc(p.name)],
    }),
    db.query.stockLocations.findMany({
      where: eq(stockLocations.active, true),
      columns: { id: true, name: true, type: true, technicianId: true },
      orderBy: (l, { asc }) => [asc(l.type), asc(l.name)],
    }),
    db.select().from(stockLevels),
  ]);
  const balance: Record<string, Record<string, number>> = {};
  for (const l of levels) {
    (balance[l.productId] ??= {})[l.locationId] = l.quantity;
  }
  return { products: prods, locations, balance };
}
