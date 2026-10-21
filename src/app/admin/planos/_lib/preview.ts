/**
 * Prévia da agenda de um plano (pura, roda no cliente e no servidor).
 * Usa as mesmas regras do gerador de OMs (src/server/core/schedule.ts).
 */
import { addMonths, monthDiff, startOfMonth, type ISODate } from "@/lib/dates";
import { tasksDueOn, visitDate, visitIntervalMonths } from "@/server/core/schedule";

export const FREQUENCY_OPTIONS = [1, 2, 3, 4, 6, 12] as const;

export const UNIT_SUGGESTIONS = ["A", "V", "°C", "psi", "%", "bar", "kPa", "Ω", "m/s"];

type TaskLike = { frequencyMonths: number; position: number; title: string };

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Frequência real de uma tarefa: ela só é feita nas visitas do plano, então cai a cada
 * mmc(intervalo, frequência) meses (ex.: trimestral num plano bimestral → a cada 6 meses).
 */
export function effectiveFrequency(intervalMonths: number, frequencyMonths: number) {
  if (frequencyMonths <= 0) return 0;
  return (intervalMonths * frequencyMonths) / gcd(intervalMonths, frequencyMonths);
}

export function intervalLabel(months: number) {
  if (months === 1) return "Todo mês";
  return `A cada ${months} meses`;
}

const PERIOD: Record<number, string> = { 1: "Mensal", 2: "Bimestral", 3: "Trimestral", 4: "Quadrimestral", 6: "Semestral", 12: "Anual" };

/** 3 → "Trimestral" (rótulo curto do intervalo de visitas) */
export function periodLabel(months: number) {
  return PERIOD[months] ?? `${months} meses`;
}

export function frequencyText(months: number) {
  if (months === 1) return "todo mês";
  if (months === 12) return "uma vez por ano";
  return `a cada ${months} meses`;
}

export type PreviewVisit<T> = { date: ISODate; monthIndex: number; tasks: T[] };

/** Visitas nos próximos `months` meses a partir da âncora, com as tarefas de cada uma. */
export function planPreview<T extends TaskLike>(tasks: T[], anchor: ISODate, months = 12) {
  const interval = visitIntervalMonths(tasks);
  const visits: PreviewVisit<T>[] = [];
  for (let k = 0; k < months; k++) {
    const date = visitDate(anchor, interval, k);
    const monthIndex = monthDiff(anchor, date);
    if (monthIndex >= months) break;
    const due = tasksDueOn(tasks, anchor, date);
    if (due.length) visits.push({ date, monthIndex, tasks: due });
  }
  const first = startOfMonth(anchor);
  const cells = Array.from({ length: months }, (_, i) => {
    const month = addMonths(first, i);
    return { month, visit: visits.find((v) => v.monthIndex === i) ?? null };
  });
  const executions = visits.reduce((n, v) => n + v.tasks.length, 0);
  return { interval, visits, cells, executions };
}

const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

/** "2026-10-01" → "out" */
export function monthAbbr(d: ISODate) {
  const [y, m] = d.split("-").map(Number);
  return monthShort.format(new Date(Date.UTC(y, m - 1, 15))).replace(".", "");
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
