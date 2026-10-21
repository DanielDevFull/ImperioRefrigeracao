import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  contractEquipment,
  contracts,
  customerSites,
  customers,
  equipment,
  equipmentTypes,
  maintenancePlans,
  maintenancePlanTasks,
  pmocDocuments,
  workOrders,
} from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { activeWorkOrderStatuses } from "@/lib/labels";
import { PAGE_SIZE } from "@/lib/params";
import { scheduleDateFor } from "@/server/core/schedule";
import { getSettings } from "@/server/settings";
import { forecastVisits } from "./forecast";

export const EQUIPMENT_STATUSES = ["ativo", "em_manutencao", "inativo", "removido"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | null | undefined): v is string => Boolean(v && UUID_RE.test(v));

/** Referência qualificada (o drizzle omite a tabela nas colunas dentro de sql``). */
const EID = sql.raw(`"equipment"."id"`);
const ACTIVE_WO = sql.raw(activeWorkOrderStatuses.map((s) => `'${s}'`).join(","));

function searchCondition(q: string | undefined): SQL | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  const like = `%${term}%`;
  const parts: (SQL | undefined)[] = [
    ilike(equipment.brand, like),
    ilike(equipment.model, like),
    ilike(equipment.serialNumber, like),
    ilike(equipment.location, like),
    ilike(equipment.refrigerant, like),
    ilike(customers.name, like),
    ilike(customers.tradeName, like),
    ilike(equipmentTypes.name, like),
    ilike(customerSites.name, like),
  ];
  const code = /^(?:eq-?)?0*(\d{1,7})$/i.exec(term)?.[1];
  if (code) parts.push(eq(equipment.code, Number(code)));
  return or(...parts);
}

function countQuery() {
  return db
    .select({ status: equipment.status, n: sql<number>`count(*)::int` })
    .from(equipment)
    .innerJoin(customers, eq(customers.id, equipment.customerId))
    .leftJoin(equipmentTypes, eq(equipmentTypes.id, equipment.typeId))
    .leftJoin(customerSites, eq(customerSites.id, equipment.siteId));
}

export async function equipmentStatusCounts({ q, typeId }: { q?: string; typeId?: string }) {
  const where = and(searchCondition(q), typeId ? eq(equipment.typeId, typeId) : undefined);
  const rows = await countQuery().where(where).groupBy(equipment.status);
  const counts: Record<EquipmentStatus | "all", number> = { all: 0, ativo: 0, em_manutencao: 0, inativo: 0, removido: 0 };
  for (const r of rows) {
    counts[r.status] = r.n;
    counts.all += r.n;
  }
  return counts;
}

export async function listEquipment({
  q,
  status,
  typeId,
  page,
}: {
  q?: string;
  status?: EquipmentStatus;
  typeId?: string;
  page: number;
}) {
  const today = todayISO();
  const where = and(
    searchCondition(q),
    status ? eq(equipment.status, status) : undefined,
    typeId ? eq(equipment.typeId, typeId) : undefined,
  );
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(equipment)
    .innerJoin(customers, eq(customers.id, equipment.customerId))
    .leftJoin(equipmentTypes, eq(equipmentTypes.id, equipment.typeId))
    .leftJoin(customerSites, eq(customerSites.id, equipment.siteId))
    .where(where);

  const rows = await db
    .select({
      id: equipment.id,
      code: equipment.code,
      brand: equipment.brand,
      model: equipment.model,
      serialNumber: equipment.serialNumber,
      capacityBtu: equipment.capacityBtu,
      refrigerant: equipment.refrigerant,
      location: equipment.location,
      status: equipment.status,
      customerId: customers.id,
      customerName: customers.name,
      customerTradeName: customers.tradeName,
      typeName: equipmentTypes.name,
      typeIcon: equipmentTypes.icon,
      siteName: customerSites.name,
      contractId: contracts.id,
      contractCode: contracts.code,
      contractStatus: contracts.status,
      contractStart: contracts.startDate,
      contractEnd: contracts.endDate,
      planId: maintenancePlans.id,
      planName: maintenancePlans.name,
      anchorDate: contractEquipment.anchorDate,
      lastGeneratedDueDate: contractEquipment.lastGeneratedDueDate,
      nextWorkOrderDate: sql<string | null>`(select min(coalesce(w.scheduled_date, w.due_date))::text from ${workOrders} w where w.equipment_id = ${EID} and w.status in (${ACTIVE_WO}))`,
    })
    .from(equipment)
    .innerJoin(customers, eq(customers.id, equipment.customerId))
    .leftJoin(equipmentTypes, eq(equipmentTypes.id, equipment.typeId))
    .leftJoin(customerSites, eq(customerSites.id, equipment.siteId))
    .leftJoin(
      contractEquipment,
      and(eq(contractEquipment.equipmentId, equipment.id), eq(contractEquipment.active, true)),
    )
    .leftJoin(contracts, eq(contracts.id, contractEquipment.contractId))
    .leftJoin(maintenancePlans, eq(maintenancePlans.id, contractEquipment.maintenancePlanId))
    .where(where)
    .orderBy(sql`lower(coalesce(${customers.tradeName}, ${customers.name}))`, asc(equipment.code))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  // Previsão pelo plano para quem não tem OM em aberto
  const planIds = [...new Set(rows.map((r) => r.planId).filter((v): v is string => Boolean(v)))];
  const tasks = planIds.length
    ? await db.query.maintenancePlanTasks.findMany({ where: inArray(maintenancePlanTasks.planId, planIds) })
    : [];
  const tasksByPlan = new Map<string, typeof tasks>();
  for (const t of tasks) tasksByPlan.set(t.planId, [...(tasksByPlan.get(t.planId) ?? []), t]);

  const items = rows.map((r) => {
    let nextVisit: { date: string; kind: "om" | "previsao" | "atrasada" } | null = null;
    if (r.nextWorkOrderDate) {
      nextVisit = { date: r.nextWorkOrderDate, kind: r.nextWorkOrderDate < today ? "atrasada" : "om" };
    } else if (r.planId && r.anchorDate && r.contractStart && r.contractStatus && r.status !== "removido") {
      const [first] = forecastVisits(
        {
          anchorDate: r.anchorDate,
          contract: { startDate: r.contractStart, endDate: r.contractEnd, status: r.contractStatus },
          plan: { tasks: tasksByPlan.get(r.planId) ?? [] },
        },
        today,
        1,
        r.lastGeneratedDueDate,
      );
      if (first) nextVisit = { date: first.date, kind: "previsao" };
    }
    return { ...r, nextVisit };
  });

  return { rows: items, total };
}

export type EquipmentListRow = Awaited<ReturnType<typeof listEquipment>>["rows"][number];

export async function equipmentTypeOptions() {
  return db
    .select({ id: equipmentTypes.id, name: equipmentTypes.name, icon: equipmentTypes.icon, category: equipmentTypes.category })
    .from(equipmentTypes)
    .orderBy(asc(equipmentTypes.name));
}

export async function customerOptions() {
  return db
    .select({ id: customers.id, name: customers.name, tradeName: customers.tradeName, status: customers.status, code: customers.code })
    .from(customers)
    .orderBy(sql`lower(coalesce(${customers.tradeName}, ${customers.name}))`);
}

export async function sitesOf(customerId: string) {
  if (!isUuid(customerId)) return [];
  return db
    .select({ id: customerSites.id, name: customerSites.name, isPrimary: customerSites.isPrimary })
    .from(customerSites)
    .where(eq(customerSites.customerId, customerId))
    .orderBy(desc(customerSites.isPrimary), asc(customerSites.name));
}

export async function getEquipmentForEdit(id: string) {
  if (!isUuid(id)) return undefined;
  return db.query.equipment.findFirst({ where: eq(equipment.id, id) });
}

/** Ficha do equipamento: cadastro, cobertura, previsão e histórico. */
export async function getEquipmentDetail(id: string) {
  if (!isUuid(id)) return null;
  const item = await db.query.equipment.findFirst({
    where: eq(equipment.id, id),
    with: {
      customer: { columns: { id: true, name: true, tradeName: true, code: true, status: true, phone: true, whatsapp: true } },
      site: true,
      type: true,
      contractLinks: {
        orderBy: [desc(contractEquipment.createdAt)],
        with: {
          contract: { columns: { id: true, code: true, name: true, status: true, startDate: true, endDate: true } },
          plan: { with: { tasks: { orderBy: [asc(maintenancePlanTasks.position)] } } },
          preferredTechnician: { columns: { id: true, name: true } },
        },
      },
    },
  });
  if (!item) return null;
  const today = todayISO();

  const settings = await getSettings();
  const history = await db.query.workOrders.findMany({
    where: eq(workOrders.equipmentId, id),
    with: {
      technician: { columns: { name: true } },
      tasks: { columns: { id: true, title: true, measurementUnit: true, measurementValue: true, done: true, position: true } },
    },
    orderBy: [desc(workOrders.number)],
  });

  const active = item.contractLinks.find((l) => l.active) ?? null;
  const forecast = active
    ? forecastVisits(
        { anchorDate: active.anchorDate, contract: active.contract, plan: { tasks: active.plan.tasks } },
        today,
        6,
      )
    : [];
  // OMs já geradas para as datas previstas
  const byDue = new Map(
    history
      .filter((w) => active && w.contractEquipmentId === active.id && w.dueDate)
      .map((w) => [w.dueDate as string, w]),
  );

  const openOrders = history
    .filter((w) => (activeWorkOrderStatuses as readonly string[]).includes(w.status))
    .sort((a, b) => (a.scheduledDate ?? a.dueDate ?? "9999").localeCompare(b.scheduledDate ?? b.dueDate ?? "9999"));
  const done = history
    .filter((w) => w.status === "concluida")
    .sort((a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0));

  return {
    item,
    active,
    forecast: forecast.map((v) => ({
      ...v,
      /** Dia útil em que a OM será agendada (fim de semana vai para o dia útil anterior) */
      scheduled: scheduleDateFor(v.date, today, settings.worksSaturday),
      workOrder: byDue.get(v.date) ?? null,
    })),
    openOrders,
    done,
    cancelled: history.filter((w) => w.status === "cancelada").length,
    today,
  };
}

export type EquipmentDetail = NonNullable<Awaited<ReturnType<typeof getEquipmentDetail>>>;

/** Dados para as etiquetas QR. */
export async function equipmentForLabels({ ids, customerId }: { ids: string[]; customerId?: string }) {
  const valid = ids.filter(isUuid);
  if (!valid.length && !isUuid(customerId)) return [];
  return db
    .select({
      id: equipment.id,
      code: equipment.code,
      qrToken: equipment.qrToken,
      location: equipment.location,
      brand: equipment.brand,
      model: equipment.model,
      typeName: equipmentTypes.name,
      siteName: customerSites.name,
      customerName: customers.name,
      customerTradeName: customers.tradeName,
    })
    .from(equipment)
    .innerJoin(customers, eq(customers.id, equipment.customerId))
    .leftJoin(equipmentTypes, eq(equipmentTypes.id, equipment.typeId))
    .leftJoin(customerSites, eq(customerSites.id, equipment.siteId))
    .where(
      valid.length
        ? inArray(equipment.id, valid)
        : and(eq(equipment.customerId, customerId!), ne(equipment.status, "removido")),
    )
    .orderBy(sql`lower(coalesce(${customers.tradeName}, ${customers.name}))`, asc(equipment.code));
}

/** PMOC vigente do local (ou do cliente) do equipamento. */
export async function validPmocFor(customerId: string, siteId: string | null, today = todayISO()) {
  const docs = await db.query.pmocDocuments.findMany({
    where: and(
      eq(pmocDocuments.customerId, customerId),
      lte(pmocDocuments.validFrom, today),
      gte(pmocDocuments.validUntil, today),
    ),
    orderBy: [desc(pmocDocuments.validUntil)],
  });
  return docs.find((d) => d.siteId === siteId) ?? docs.find((d) => !d.siteId) ?? (siteId ? null : docs[0] ?? null);
}
