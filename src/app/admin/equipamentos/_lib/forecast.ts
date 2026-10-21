import { addDays } from "@/lib/dates";
import { tasksDueOn, upcomingVisits, visitIntervalMonths, type PlanTask } from "@/server/core/schedule";

export type CoverageInput = {
  anchorDate: string;
  contract: { startDate: string; endDate: string | null; status: string };
  plan: { tasks: PlanTask[] };
};

/**
 * Próximas visitas previstas pelo plano (respeitando início e fim do contrato), com as tarefas de cada uma.
 * `after`: última data já gerada como OM — para "próxima visita" pula o que já virou OM.
 */
export function forecastVisits(link: CoverageInput, today: string, count: number, after?: string | null) {
  const tasks = link.plan.tasks;
  if (!tasks.length || link.contract.status !== "ativo") return [];
  const interval = visitIntervalMonths(tasks);
  const from = [today, link.contract.startDate, after ? addDays(after, 1) : today].sort().at(-1)!;
  return upcomingVisits(link.anchorDate, interval, from, count)
    .filter((d) => !link.contract.endDate || d <= link.contract.endDate)
    .map((date) => ({ date, tasks: tasksDueOn(tasks, link.anchorDate, date) }))
    .filter((v) => v.tasks.length > 0);
}

export function intervalLabel(tasks: Pick<PlanTask, "frequencyMonths">[]) {
  const m = visitIntervalMonths(tasks);
  if (m === 1) return "Visita mensal";
  if (m === 12) return "Visita anual";
  return `Visita a cada ${m} meses`;
}
