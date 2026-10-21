import { tasksDueOn, upcomingVisits, visitIntervalMonths, type PlanTask } from "@/server/core/schedule";

export type CoverageInput = {
  anchorDate: string;
  contract: { startDate: string; endDate: string | null; status: string };
  plan: { tasks: PlanTask[] };
};

/** Próximas visitas previstas pelo plano (respeitando o fim do contrato), com as tarefas de cada uma. */
export function forecastVisits(link: CoverageInput, today: string, count: number) {
  const tasks = link.plan.tasks;
  if (!tasks.length || link.contract.status !== "ativo") return [];
  const interval = visitIntervalMonths(tasks);
  const from = link.contract.startDate > today ? link.contract.startDate : today;
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
