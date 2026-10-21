import { addDays, competenceOf, diffDays, dueDateFor, addCompetence, type ISODate } from "@/lib/dates";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Multa (uma vez) + juros simples pró-rata dia sobre o valor em atraso. */
export function lateCharges({
  amount,
  dueDate,
  paidOn,
  finePercent,
  interestMonthlyPercent,
}: {
  amount: number;
  dueDate: ISODate;
  paidOn: ISODate;
  finePercent: number;
  interestMonthlyPercent: number;
}) {
  const daysLate = Math.max(0, diffDays(dueDate, paidOn));
  if (daysLate === 0) return { daysLate, fine: 0, interest: 0, total: round2(amount) };
  const fine = round2((amount * finePercent) / 100);
  const interest = round2(amount * (interestMonthlyPercent / 100 / 30) * daysLate);
  return { daysLate, fine, interest, total: round2(amount + fine + interest) };
}

/**
 * Competências de mensalidade que devem existir hoje para um contrato:
 * a primeira é a do primeiro vencimento na data de início ou depois; gera-se cada competência quando faltam
 * `leadDays` dias (ou menos) para o vencimento. Não recria as já existentes
 * e não volta mais que 1 competência no passado.
 */
export function competencesToBill({
  startDate,
  endDate,
  billingDay,
  today,
  leadDays,
  existing,
}: {
  startDate: ISODate;
  endDate: ISODate | null;
  billingDay: number;
  today: ISODate;
  leadDays: number;
  existing: Set<string>;
}): { competence: string; dueDate: ISODate }[] {
  const out: { competence: string; dueDate: ISODate }[] = [];
  const horizon = addDays(today, leadDays);
  const first = competenceOf(startDate);
  const oldest = addCompetence(competenceOf(today), -1);
  let comp = first > oldest ? first : oldest;
  for (let i = 0; i < 24; i++) {
    const due = dueDateFor(comp, billingDay);
    if (due > horizon) break;
    if (endDate && due > endDate) break;
    // a primeira mensalidade é a do primeiro vencimento a partir do início do contrato
    if (due >= startDate && !existing.has(comp)) out.push({ competence: comp, dueDate: due });
    comp = addCompetence(comp, 1);
  }
  return out;
}

/** Dias de atraso da conta mais antiga em aberto (0 se em dia). */
export function maxDaysOverdue(openDueDates: ISODate[], today: ISODate) {
  return openDueDates.reduce((max, d) => Math.max(max, diffDays(d, today)), 0);
}
