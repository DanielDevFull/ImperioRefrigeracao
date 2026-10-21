/**
 * Datas de calendário como strings ISO "YYYY-MM-DD" (o tipo `date` do Postgres),
 * sempre no fuso de São Paulo, para não haver troca de dia por fuso horário.
 */
export const TZ = "America/Sao_Paulo";

export type ISODate = string;

/** Hoje em São Paulo, "YYYY-MM-DD". */
export function todayISO(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parts(d: ISODate) {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return { y, m, day };
}

function fmt(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, day } = parts(d);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Soma meses mantendo o dia; se o mês não tiver o dia (31), usa o último dia do mês. */
export function addMonths(d: ISODate, n: number, anchorDay?: number): ISODate {
  const { y, m, day } = parts(d);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const wanted = anchorDay ?? day;
  return fmt(ny, nm, Math.min(wanted, daysInMonth(ny, nm)));
}

/** Diferença em meses de calendário (b - a), ignorando o dia. */
export function monthDiff(a: ISODate, b: ISODate) {
  const pa = parts(a);
  const pb = parts(b);
  return (pb.y - pa.y) * 12 + (pb.m - pa.m);
}

export function diffDays(a: ISODate, b: ISODate) {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.day) - Date.UTC(pa.y, pa.m - 1, pa.day)) / 86_400_000,
  );
}

/** 0 = domingo … 6 = sábado */
export function weekday(d: ISODate) {
  const { y, m, day } = parts(d);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

/** Move domingos (e sábados, se a empresa não atende) para o dia útil anterior. */
export function toWorkingDay(d: ISODate, worksSaturday = false): ISODate {
  let cur = d;
  for (let i = 0; i < 3; i++) {
    const wd = weekday(cur);
    if (wd === 0 || (wd === 6 && !worksSaturday)) cur = addDays(cur, -1);
    else break;
  }
  return cur;
}

export function competenceOf(d: ISODate) {
  return d.slice(0, 7);
}

export function addCompetence(competence: string, n: number) {
  return addMonths(`${competence}-01`, n).slice(0, 7);
}

/** Data de vencimento da competência no dia de cobrança (1–28). */
export function dueDateFor(competence: string, billingDay: number): ISODate {
  const [y, m] = competence.split("-").map(Number);
  return fmt(y, m, Math.min(Math.max(1, billingDay), daysInMonth(y, m)));
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: ISODate): ISODate {
  const { y, m } = parts(d);
  return fmt(y, m, daysInMonth(y, m));
}

export function startOfWeek(d: ISODate): ISODate {
  // semana começando na segunda-feira
  const wd = weekday(d);
  return addDays(d, wd === 0 ? -6 : 1 - wd);
}

export function isBetween(d: ISODate, start: ISODate, end: ISODate) {
  return d >= start && d <= end;
}

export function toISODate(date: Date): ISODate {
  return todayISO(date);
}
