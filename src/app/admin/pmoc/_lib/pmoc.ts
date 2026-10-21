import "server-only";
import { and, asc, eq, inArray, ne, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { contractEquipment, equipment, pmocDocuments, workOrders } from "@/db/schema";
import { addDays, addMonths, diffDays, monthDiff, todayISO, type ISODate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { tasksDueOn, upcomingVisits, visitIntervalMonths } from "@/server/core/schedule";

export type PmocDoc = typeof pmocDocuments.$inferSelect;

/* ------------------------------------------------------------------ Vigência */

export type ValidityKey = "vigente" | "vencendo" | "vencido" | "futuro" | "renovado";
export type Validity = { key: ValidityKey; label: string; tone: Tone; days: number };

/** Situação da vigência: Vigente, Vence em N dias (≤ 30), Vencido, a começar ou já renovado. */
export function validityOf(doc: Pick<PmocDoc, "validFrom" | "validUntil">, today: ISODate, renewed = false): Validity {
  const days = diffDays(today, doc.validUntil);
  if (renewed) return { key: "renovado", label: "Renovado", tone: "steel", days };
  if (doc.validFrom > today) return { key: "futuro", label: `Começa em ${formatDate(doc.validFrom)}`, tone: "violet", days };
  if (days < 0) return { key: "vencido", label: "Vencido", tone: "red", days };
  if (days <= 30)
    return { key: "vencendo", label: days === 0 ? "Vence hoje" : days === 1 ? "Vence amanhã" : `Vence em ${days} dias`, tone: "brass", days };
  return { key: "vigente", label: "Vigente", tone: "mint", days };
}

/** Um documento foi renovado quando existe outro do mesmo cliente/local começando depois dele. */
export function isRenewed(doc: PmocDoc, all: Pick<PmocDoc, "id" | "customerId" | "siteId" | "validFrom">[]) {
  return all.some(
    (o) => o.id !== doc.id && o.customerId === doc.customerId && (o.siteId ?? null) === (doc.siteId ?? null) && o.validFrom > doc.validFrom,
  );
}

/** Fim padrão da vigência: 12 meses menos um dia. */
export function defaultValidUntil(from: ISODate) {
  return addDays(addMonths(from, 12), -1);
}

/* ------------------------------------------------------ Equipamentos cobertos */

const FREQ_LETTER: Record<number, string> = { 1: "M", 2: "B", 3: "T", 4: "Q", 6: "S", 12: "A" };
export const frequencyLetter = (months: number) => FREQ_LETTER[months] ?? `${months}m`;

async function loadSiteEquipment(customerId: string, siteId: string | null) {
  const where: SQL[] = [eq(equipment.customerId, customerId), ne(equipment.status, "removido")];
  if (siteId) where.push(eq(equipment.siteId, siteId));
  return db.query.equipment.findMany({
    where: and(...where),
    with: {
      type: true,
      site: { columns: { id: true, name: true } },
      contractLinks: {
        where: eq(contractEquipment.active, true),
        with: {
          plan: { with: { tasks: { orderBy: (t, { asc: a }) => [a(t.position)] } } },
          contract: { columns: { id: true, code: true, name: true, status: true } },
        },
      },
    },
    orderBy: [asc(equipment.location), asc(equipment.code)],
  });
}

type SiteEquipment = Awaited<ReturnType<typeof loadSiteEquipment>>[number];
export type CoveredItem = {
  equipment: SiteEquipment;
  link: SiteEquipment["contractLinks"][number];
  plan: SiteEquipment["contractLinks"][number]["plan"];
  interval: number;
};

/** Equipamentos do local cobertos por um plano PMOC ativo, e os que ainda estão de fora. */
export async function coveredEquipment(doc: Pick<PmocDoc, "customerId" | "siteId">) {
  const all = await loadSiteEquipment(doc.customerId, doc.siteId);
  const covered: CoveredItem[] = [];
  const uncovered: SiteEquipment[] = [];
  for (const e of all) {
    const link = e.contractLinks.find((l) => l.plan.isPmoc);
    if (link) covered.push({ equipment: e, link, plan: link.plan, interval: visitIntervalMonths(link.plan.tasks) });
    else uncovered.push(e);
  }
  return { covered, uncovered };
}

/** Planos usados pelos equipamentos cobertos (sem repetição). */
export function plansOf(covered: CoveredItem[]) {
  const map = new Map<string, CoveredItem["plan"]>();
  for (const c of covered) map.set(c.plan.id, c.plan);
  return [...map.values()];
}

/* ------------------------------------------------------------- Conformidade */

export type VisitStatus = "realizada" | "atrasada" | "cancelada" | "sem_registro" | "agendada" | "prevista";

export const visitStatusLabel: Record<VisitStatus, { label: string; tone: Tone }> = {
  realizada: { label: "Realizada", tone: "mint" },
  atrasada: { label: "OM atrasada", tone: "red" },
  cancelada: { label: "OM cancelada", tone: "red" },
  sem_registro: { label: "Sem OM registrada", tone: "brass" },
  agendada: { label: "Agendada", tone: "violet" },
  prevista: { label: "Prevista", tone: "frost" },
};

const NONCONFORMING: VisitStatus[] = ["atrasada", "cancelada", "sem_registro"];

async function loadWorkOrders(customerId: string, equipmentIds: string[]) {
  if (!equipmentIds.length) return [];
  return db.query.workOrders.findMany({
    where: and(eq(workOrders.customerId, customerId), inArray(workOrders.equipmentId, equipmentIds)),
    columns: {
      id: true,
      number: true,
      type: true,
      status: true,
      equipmentId: true,
      dueDate: true,
      scheduledDate: true,
      finishedAt: true,
      title: true,
      solution: true,
    },
    with: { technician: { columns: { id: true, name: true } } },
  });
}

type WO = Awaited<ReturnType<typeof loadWorkOrders>>[number];
export type Visit = {
  equipmentId: string;
  date: ISODate;
  month: string;
  /** Maior periodicidade das tarefas que caem nesta visita (letra do cronograma) */
  letter: string;
  status: VisitStatus;
  om: WO | null;
};

const omMonth = (wo: WO) => (wo.dueDate ?? wo.scheduledDate ?? (wo.finishedAt ? todayISO(wo.finishedAt) : null))?.slice(0, 7) ?? null;
const PLANNED_TYPES = new Set(["pmoc", "preventiva"]);

/**
 * Compara as visitas previstas pelos planos (âncora + intervalo) dentro da vigência com as OMs
 * preventivas/PMOC registradas no mesmo mês para o mesmo equipamento.
 */
export async function pmocCompliance(doc: Pick<PmocDoc, "customerId" | "validFrom" | "validUntil">, covered: CoveredItem[], today = todayISO()) {
  const wos = await loadWorkOrders(
    doc.customerId,
    covered.map((c) => c.equipment.id),
  );
  const planned = wos.filter((w) => PLANNED_TYPES.has(w.type));
  const span = monthDiff(doc.validFrom, doc.validUntil) + 2;

  const visits: Visit[] = [];
  for (const c of covered) {
    const dates = upcomingVisits(c.link.anchorDate, c.interval, doc.validFrom, span).filter((d) => d <= doc.validUntil);
    const mine = planned.filter((w) => w.equipmentId === c.equipment.id);
    for (const date of dates) {
      const month = date.slice(0, 7);
      const sameMonth = mine.filter((w) => omMonth(w) === month);
      const done = sameMonth.find((w) => w.status === "concluida");
      const active = sameMonth.find((w) => w.status !== "concluida" && w.status !== "cancelada");
      const cancelled = sameMonth.find((w) => w.status === "cancelada");
      const due = tasksDueOn(c.plan.tasks, c.link.anchorDate, date);
      const letter = frequencyLetter(due.length ? Math.max(...due.map((t) => t.frequencyMonths)) : c.interval);
      let status: VisitStatus;
      let om: WO | null = null;
      if (done) {
        status = "realizada";
        om = done;
      } else if (active) {
        om = active;
        status = date < today && (active.scheduledDate ?? date) < today ? "atrasada" : "agendada";
      } else if (date < today) {
        status = cancelled ? "cancelada" : "sem_registro";
        om = cancelled ?? null;
      } else status = "prevista";
      visits.push({ equipmentId: c.equipment.id, date, month, letter, status, om });
    }
  }
  visits.sort((a, b) => a.date.localeCompare(b.date));

  const evaluated = visits.filter((v) => v.status === "realizada" || NONCONFORMING.includes(v.status));
  const done = evaluated.filter((v) => v.status === "realizada").length;
  const rate = evaluated.length ? done / evaluated.length : null;

  // Meses da vigência até o mês atual
  const months: { key: string; previstas: number; realizadas: number }[] = [];
  const lastMonth = (doc.validUntil < today ? doc.validUntil : today).slice(0, 7);
  for (let i = 0; i < 36; i++) {
    const key = addMonths(`${doc.validFrom.slice(0, 7)}-01`, i).slice(0, 7);
    if (key > lastMonth) break;
    const inMonth = visits.filter((v) => v.month === key);
    months.push({ key, previstas: inMonth.length, realizadas: inMonth.filter((v) => v.status === "realizada").length });
  }

  // Registro de execução: OMs concluídas nos equipamentos cobertos dentro da vigência
  const executed = wos
    .filter((w) => w.status === "concluida")
    .filter((w) => {
      const d = w.finishedAt ? todayISO(w.finishedAt) : (w.scheduledDate ?? w.dueDate);
      return !!d && d >= doc.validFrom && d <= doc.validUntil;
    })
    .sort((a, b) => (a.finishedAt?.getTime() ?? 0) - (b.finishedAt?.getTime() ?? 0));

  return {
    visits,
    nonConformities: visits.filter((v) => NONCONFORMING.includes(v.status)),
    evaluated: evaluated.length,
    done,
    rate,
    months,
    executed,
    lastPmocAt: executed.filter((w) => PLANNED_TYPES.has(w.type)).at(-1)?.finishedAt ?? null,
  };
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10" → "out/26" */
export function shortMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]}/${String(y).slice(2)}`;
}
