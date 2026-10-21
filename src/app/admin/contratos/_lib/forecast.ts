/**
 * Previsões puras do contrato (rodam no cliente e no servidor) com as mesmas regras do
 * gerador de OMs (src/server/scheduler.ts) e das mensalidades (src/server/core/billing.ts).
 */
import { addDays, addMonths, endOfMonth, startOfMonth, type ISODate } from "@/lib/dates";
import { competencesToBill } from "@/server/core/billing";
import { dueDatesToGenerate, tasksDueOn, visitIntervalMonths } from "@/server/core/schedule";

/** Igual ao GRACE_DAYS de src/server/scheduler.ts: o gerador ainda cria OMs vencidas há até 15 dias. */
export { GENERATOR_GRACE_DAYS } from "@/server/core/schedule";
import { GENERATOR_GRACE_DAYS } from "@/server/core/schedule";

export type ScheduleTask = { id?: string; frequencyMonths: number; position: number };
export type ScheduleItem = { anchorDate: ISODate; tasks: ScheduleTask[] };
export type ContractWindow = { startDate: ISODate; endDate: ISODate | null };

/** Vencimentos de visita do item entre `from` e `until` (inclusive), respeitando a vigência. */
export function visitsBetween(item: ScheduleItem, contract: ContractWindow, from: ISODate, until: ISODate): ISODate[] {
  if (!item.tasks.length) return [];
  const interval = visitIntervalMonths(item.tasks);
  const notBefore = from > contract.startDate ? from : contract.startDate;
  const end = contract.endDate && contract.endDate < until ? contract.endDate : until;
  if (end < notBefore) return [];
  return dueDatesToGenerate({ anchor: item.anchorDate, intervalMonths: interval, lastGenerated: null, notBefore, until: end }).filter(
    (d) => tasksDueOn(item.tasks, item.anchorDate, d).length > 0,
  );
}

/** Próxima visita prevista a partir de hoje (ou null se o contrato termina antes). */
export function nextVisit(item: ScheduleItem, contract: ContractWindow, today: ISODate): ISODate | null {
  return visitsBetween(item, contract, today, addMonths(today, 25))[0] ?? null;
}

/** Datas que o gerador criaria hoje (janela: hoje − 15 dias até hoje + horizonte). */
export function visitsGeneratedNow(item: ScheduleItem, contract: ContractWindow, today: ISODate, horizonDays: number) {
  return visitsBetween(item, contract, addDays(today, -GENERATOR_GRACE_DAYS), addDays(today, horizonDays));
}

/** Contagem de visitas por mês nos próximos `months` meses (a partir do mês de hoje). */
export function monthlyForecast<T extends ScheduleItem>(items: T[], contract: ContractWindow, today: ISODate, months = 12) {
  const first = startOfMonth(today);
  const last = endOfMonth(addMonths(first, months - 1));
  const cells = Array.from({ length: months }, (_, i) => ({ month: addMonths(first, i), dates: [] as ISODate[], items: [] as T[] }));
  for (const item of items) {
    for (const d of visitsBetween(item, contract, first, last)) {
      const idx = cells.findIndex((c) => c.month.slice(0, 7) === d.slice(0, 7));
      if (idx >= 0) {
        cells[idx].dates.push(d);
        cells[idx].items.push(item);
      }
    }
  }
  return cells;
}

/** Mensalidades que a rotina gera hoje para um contrato novo (sem nenhuma existente). */
export function invoicesGeneratedNow(contract: ContractWindow & { billingDay: number }, today: ISODate, leadDays: number) {
  return competencesToBill({
    startDate: contract.startDate,
    endDate: contract.endDate,
    billingDay: contract.billingDay,
    today,
    leadDays,
    existing: new Set(),
  });
}

/** Primeira mensalidade do contrato (competência do mês de início). */
export function firstInvoice(contract: ContractWindow & { billingDay: number }) {
  const all = competencesToBill({
    startDate: contract.startDate,
    endDate: contract.endDate,
    billingDay: contract.billingDay,
    today: contract.startDate,
    leadDays: 62,
    existing: new Set(),
  });
  return all[0] ?? null;
}
