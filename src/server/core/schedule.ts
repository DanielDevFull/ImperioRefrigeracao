import { addDays, addMonths, monthDiff, toWorkingDay, type ISODate } from "@/lib/dates";

export type PlanTask = {
  id: string;
  title: string;
  instructions?: string | null;
  frequencyMonths: number;
  position: number;
  measurementUnit?: string | null;
  requiresPhoto?: boolean;
};

/** A visita acontece na menor frequência entre as tarefas do plano (mínimo 1 mês). */
export function visitIntervalMonths(tasks: Pick<PlanTask, "frequencyMonths">[]) {
  const freqs = tasks.map((t) => t.frequencyMonths).filter((f) => f > 0);
  return freqs.length ? Math.max(1, Math.min(...freqs)) : 1;
}

/** k-ésima data de visita a partir da âncora (k = 0 é a própria âncora). */
export function visitDate(anchor: ISODate, intervalMonths: number, k: number): ISODate {
  const anchorDay = Number(anchor.slice(8, 10));
  return addMonths(anchor, k * intervalMonths, anchorDay);
}

/**
 * Datas de vencimento a gerar: sequência âncora + k·intervalo, posteriores à última
 * gerada, não anteriores a `notBefore` e até `until` (inclusive).
 */
export function dueDatesToGenerate({
  anchor,
  intervalMonths,
  lastGenerated,
  notBefore,
  until,
}: {
  anchor: ISODate;
  intervalMonths: number;
  lastGenerated: ISODate | null;
  notBefore: ISODate;
  until: ISODate;
}): ISODate[] {
  const out: ISODate[] = [];
  if (anchor > until) return out;
  // pula direto para perto de notBefore para não iterar anos de histórico
  const startK = Math.max(0, Math.floor(monthDiff(anchor, notBefore) / intervalMonths) - 1);
  for (let k = startK; k < startK + 400; k++) {
    const d = visitDate(anchor, intervalMonths, k);
    if (d > until) break;
    if (d < notBefore) continue;
    if (lastGenerated && d <= lastGenerated) continue;
    out.push(d);
  }
  return out;
}

/** Tarefas que caem na visita: meses desde a âncora múltiplos da frequência da tarefa. */
export function tasksDueOn<T extends Pick<PlanTask, "frequencyMonths" | "position">>(
  tasks: T[],
  anchor: ISODate,
  due: ISODate,
): T[] {
  const months = monthDiff(anchor, due);
  return tasks
    .filter((t) => t.frequencyMonths > 0 && months % t.frequencyMonths === 0)
    .sort((a, b) => a.position - b.position);
}

/** Próximas N visitas a partir de uma data (previsão para o portal e a ficha do equipamento). */
export function upcomingVisits(anchor: ISODate, intervalMonths: number, from: ISODate, count: number) {
  return dueDatesToGenerate({
    anchor,
    intervalMonths,
    lastGenerated: null,
    notBefore: from,
    until: addMonths(from, intervalMonths * (count + 1)),
  }).slice(0, count);
}

/** Data de agendamento: o vencimento ajustado para dia útil, nunca antes de hoje. */
export function scheduleDateFor(due: ISODate, today: ISODate, worksSaturday: boolean): ISODate {
  const working = toWorkingDay(due, worksSaturday);
  if (working >= today) return working;
  // vencimento já passou (atraso na geração): agenda para o próximo dia útil a partir de hoje
  let d = today;
  for (let i = 0; i < 4; i++) {
    const adj = toWorkingDay(d, worksSaturday);
    if (adj === d) return d;
    d = addDays(d, 1);
  }
  return today;
}

export function isTechnicianAbsent(
  absences: { startDate: ISODate; endDate: ISODate }[],
  date: ISODate,
) {
  return absences.some((a) => date >= a.startDate && date <= a.endDate);
}
