import { TZ } from "@/lib/dates";

/** "1 OM" / "3 OMs" */
export function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

/** Hora atual em São Paulo, em minutos desde a meia-noite. */
export function nowMinutes(now = new Date()) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(now)
    .split(":")
    .map(Number);
  return h * 60 + m;
}

export function greeting(minutes: number) {
  if (minutes < 5 * 60) return "Boa noite";
  if (minutes < 12 * 60) return "Bom dia";
  if (minutes < 18 * 60) return "Boa tarde";
  return "Boa noite";
}

/** "08:30" → 510 */
export function toMinutes(hhmm: string | null | undefined) {
  if (!hhmm) return null;
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** "2026-10-21 14:05" (São Paulo) → minutos do dia; antes de hoje vira 0. */
export function stampMinutes(stamp: string | null | undefined, today: string) {
  if (!stamp) return null;
  if (stamp.slice(0, 10) < today) return 0;
  return toMinutes(stamp.slice(11, 16));
}

export function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

function monthDate(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15));
}

/** "2026-05" → "Mai" */
export function monthLabel(ym: string) {
  const s = monthShort.format(monthDate(ym)).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "2026-05" → "maio" */
export function monthName(ym: string) {
  return monthLong.format(monthDate(ym));
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function firstName(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}
