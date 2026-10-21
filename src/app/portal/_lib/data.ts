import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contractEquipment,
  contracts,
  customers,
  equipment,
  maintenancePlanTasks,
  technicians,
  workOrders,
  type UserRole,
} from "@/db/schema";
import { todayISO, type ISODate } from "@/lib/dates";
import { whatsappLink } from "@/lib/format";
import { activeWorkOrderStatuses } from "@/lib/labels";
import type { Settings } from "@/server/settings";
import { firstName } from "./copy";
import { forecastVisits, healthOf, intervalOf, type ForecastVisit, type Health, type PlanTaskLike } from "./forecast";

/** Perfis que podem usar as ações do portal. */
export const PORTAL_ROLES: UserRole[] = ["cliente", "admin", "gestor"];

/**
 * Cliente vinculado ao usuário logado, para Server Actions (lança erro em vez de redirecionar).
 * Chame depois de `assertRole(PORTAL_ROLES)`.
 */
export async function customerForUser(userId: string) {
  const customer = await db.query.customers.findFirst({ where: eq(customers.userId, userId) });
  if (!customer) throw new Error("Seu acesso não está vinculado a um cadastro de cliente. Fale com a Imperium.");
  return customer;
}

export function equipmentQrUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return `${base}/e/${token}`;
}

export function contactLink(settings: Settings, text: string) {
  return whatsappLink(settings.whatsapp ?? settings.phone, text);
}

export const ACTIVE_STATUSES = [...activeWorkOrderStatuses];

export type NextVisit = {
  date: ISODate;
  time: string | null;
  source: "om" | "forecast";
  workOrderId: string | null;
  technician: string | null;
  tasks: string[];
};

export type EquipmentOverview = Awaited<ReturnType<typeof getEquipmentOverview>>[number];

/**
 * Equipamentos do cliente (sem os removidos) com cobertura do plano,
 * próxima manutenção (OM agendada ou previsão), último serviço e indicador de saúde.
 */
export async function getEquipmentOverview(customerId: string, today: ISODate = todayISO()) {
  const [rows, active, lastRows, customer] = await Promise.all([
    db.query.equipment.findMany({
      where: and(eq(equipment.customerId, customerId), ne(equipment.status, "removido")),
      with: {
        type: true,
        site: true,
        contractLinks: {
          where: eq(contractEquipment.active, true),
          with: {
            contract: { columns: { id: true, name: true, status: true } },
            plan: {
              columns: { id: true, name: true, isPmoc: true },
              with: { tasks: { orderBy: [asc(maintenancePlanTasks.position)] } },
            },
            preferredTechnician: { columns: { name: true } },
          },
        },
      },
      orderBy: [asc(equipment.code)],
    }),
    db.query.workOrders.findMany({
      where: and(eq(workOrders.customerId, customerId), inArray(workOrders.status, ACTIVE_STATUSES)),
      with: { technician: { columns: { name: true } }, tasks: { columns: { title: true, position: true } } },
      orderBy: [asc(sql`coalesce(${workOrders.scheduledDate}, ${workOrders.dueDate})`)],
    }),
    db
      .selectDistinctOn([workOrders.equipmentId], {
        equipmentId: workOrders.equipmentId,
        id: workOrders.id,
        type: workOrders.type,
        finishedAt: workOrders.finishedAt,
      })
      .from(workOrders)
      .where(and(eq(workOrders.customerId, customerId), eq(workOrders.status, "concluida"), isNotNull(workOrders.equipmentId)))
      .orderBy(workOrders.equipmentId, desc(workOrders.finishedAt)),
    db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      columns: { defaultTechnicianId: true },
    }),
  ]);

  const defaultTech = customer?.defaultTechnicianId
    ? await db.query.technicians.findFirst({ where: eq(technicians.id, customer.defaultTechnicianId), columns: { name: true } })
    : null;

  const lastBy = new Map(lastRows.map((r) => [r.equipmentId!, r]));

  return rows.map((eq_) => {
    const link = eq_.contractLinks.find((l) => l.contract.status === "ativo") ?? null;
    const tasks: PlanTaskLike[] = link?.plan.tasks ?? [];
    const linkLike = link ? { anchorDate: link.anchorDate, lastGeneratedDueDate: link.lastGeneratedDueDate, tasks } : null;
    const forecast: ForecastVisit[] = linkLike ? forecastVisits(linkLike, today, 4) : [];
    const orders = active.filter((w) => w.equipmentId === eq_.id);
    const fallbackTech = firstName(link?.preferredTechnician?.name ?? defaultTech?.name);

    const visits: NextVisit[] = [
      ...orders
        .filter((w) => w.scheduledDate ?? w.dueDate)
        .map<NextVisit>((w) => ({
          date: (w.scheduledDate ?? w.dueDate)!,
          time: w.scheduledTime,
          source: "om",
          workOrderId: w.id,
          technician: firstName(w.technician?.name) ?? fallbackTech,
          tasks: [...w.tasks].sort((a, b) => a.position - b.position).map((t) => t.title),
        })),
      ...forecast.map<NextVisit>((f) => ({
        date: f.date,
        time: null,
        source: "forecast",
        workOrderId: null,
        technician: fallbackTech,
        tasks: f.tasks.map((t) => t.title),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    const nextVisit = visits.find((v) => v.date >= today || v.source === "om") ?? null;
    const last = lastBy.get(eq_.id) ?? null;
    const lastServiceDate = last?.finishedAt ? todayISO(last.finishedAt) : null;
    const interval = intervalOf(linkLike);
    const openCorrective = orders.some((w) => w.type !== "preventiva" && w.type !== "pmoc");
    const health: Health = healthOf({
      status: eq_.status,
      intervalMonths: interval,
      lastServiceDate,
      nextVisitDate: nextVisit?.date ?? null,
      openCorrective,
      today,
    });

    return {
      equipment: eq_,
      plan: link
        ? {
            contractName: link.contract.name,
            planName: link.plan.name,
            isPmoc: link.plan.isPmoc,
            intervalMonths: interval,
            anchorDate: link.anchorDate,
            tasks,
          }
        : null,
      visits,
      nextVisit,
      lastService: last ? { id: last.id, type: last.type, date: lastServiceDate } : null,
      health,
      activeOrders: orders,
    };
  });
}

/** Contratos vigentes (ativos ou suspensos) do cliente. */
export async function getCurrentContracts(customerId: string) {
  return db.query.contracts.findMany({
    where: and(eq(contracts.customerId, customerId), inArray(contracts.status, ["ativo", "suspenso"])),
    orderBy: [asc(contracts.startDate)],
  });
}

/** Agrupa a próxima visita de todos os equipamentos (data mais próxima). */
export function nextVisitSummary(items: EquipmentOverview[]) {
  const dated = items.filter((i) => i.nextVisit).map((i) => ({ item: i, v: i.nextVisit! }));
  if (!dated.length) return null;
  const date = dated.reduce((min, d) => (d.v.date < min ? d.v.date : min), dated[0].v.date);
  const sameDay = dated.filter((d) => d.v.date === date);
  const fromOm = sameDay.find((d) => d.v.source === "om");
  const time = sameDay.map((d) => d.v.time).find(Boolean) ?? null;
  return {
    date,
    time,
    equipmentCount: sameDay.length,
    technician: (fromOm ?? sameDay[0]).v.technician,
    confirmed: Boolean(fromOm),
  };
}
