/**
 * Previsão de visitas e "saúde" de cada equipamento, a partir do vínculo
 * contrato ↔ equipamento (âncora + tarefas do plano) e das OMs existentes.
 * Usa as regras puras de src/server/core/schedule (nunca reimplementa).
 */
import { addDays, diffDays, type ISODate } from "@/lib/dates";
import type { Tone } from "@/lib/labels";
import { scheduleDateFor, tasksDueOn, upcomingVisits, visitIntervalMonths } from "@/server/core/schedule";

export type PlanTaskLike = {
  id: string;
  title: string;
  frequencyMonths: number;
  position: number;
  measurementUnit: string | null;
};

export type LinkLike = {
  anchorDate: ISODate;
  lastGeneratedDueDate: ISODate | null;
  tasks: PlanTaskLike[];
};

/** `due` é o vencimento pelo plano; `date` é o dia útil em que a visita deve acontecer. */
export type ForecastVisit = { date: ISODate; due: ISODate; tasks: PlanTaskLike[] };

/** Próximas visitas ainda não geradas como OM (as já geradas aparecem como OMs agendadas). */
export function forecastVisits(link: LinkLike, today: ISODate, count: number, worksSaturday = false): ForecastVisit[] {
  if (!link.tasks.length) return [];
  const interval = visitIntervalMonths(link.tasks);
  const from =
    link.lastGeneratedDueDate && link.lastGeneratedDueDate >= today ? addDays(link.lastGeneratedDueDate, 1) : today;
  return upcomingVisits(link.anchorDate, interval, from, count).map((due) => ({
    due,
    date: scheduleDateFor(due, today, worksSaturday),
    tasks: tasksDueOn(link.tasks, link.anchorDate, due),
  }));
}

export function intervalOf(link: LinkLike | null) {
  return link && link.tasks.length ? visitIntervalMonths(link.tasks) : null;
}

export type Health = { label: string; tone: Tone; hint: string; progress: number | null };

/**
 * Indicador simples para o cliente: em dia, revisão pendente, em manutenção…
 * `progress` (0–1) é quanto do intervalo entre a última e a próxima visita já passou.
 */
export function healthOf({
  status,
  intervalMonths,
  lastServiceDate,
  nextVisitDate,
  openCorrective,
  today,
}: {
  status: string;
  intervalMonths: number | null;
  lastServiceDate: ISODate | null;
  nextVisitDate: ISODate | null;
  openCorrective: boolean;
  today: ISODate;
}): Health {
  const progress =
    lastServiceDate && nextVisitDate && nextVisitDate > lastServiceDate
      ? Math.min(1, Math.max(0, diffDays(lastServiceDate, today) / diffDays(lastServiceDate, nextVisitDate)))
      : null;

  if (status === "em_manutencao") return { label: "Em manutenção", tone: "ice", hint: "Atendimento em andamento.", progress };
  if (openCorrective) return { label: "Chamado aberto", tone: "brass", hint: "Há um atendimento corretivo em andamento.", progress };
  if (status === "inativo") return { label: "Desativado", tone: "steel", hint: "Equipamento marcado como inativo.", progress: null };

  if (intervalMonths) {
    if (!lastServiceDate) return { label: "Aguardando 1ª visita", tone: "violet", hint: "A primeira manutenção do plano ainda não aconteceu.", progress: null };
    const limit = intervalMonths * 31 + 15;
    const since = diffDays(lastServiceDate, today);
    if (since <= limit) return { label: "Em dia", tone: "mint", hint: `Última manutenção há ${since} dia${since === 1 ? "" : "s"}.`, progress };
    return { label: "Revisão pendente", tone: "brass", hint: `Última manutenção há ${since} dias.`, progress };
  }
  if (lastServiceDate && diffDays(lastServiceDate, today) <= 180) {
    return { label: "Atendido recentemente", tone: "frost", hint: "Fora do plano de manutenção.", progress: null };
  }
  return { label: "Sem plano", tone: "steel", hint: "Este equipamento não está em um plano de manutenção.", progress: null };
}
