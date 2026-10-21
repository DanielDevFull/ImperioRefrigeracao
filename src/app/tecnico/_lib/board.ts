import type { TicketRow } from "./queries";

/** "08:00:00" + 90 min → "09:30". */
export function endTime(start: string | null | undefined, minutes: number | null | undefined) {
  if (!start || !minutes) return null;
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export type TicketGroup = { siteId: string | null; rows: TicketRow[] };

/** Agrupa OMs consecutivas do mesmo endereço (vários equipamentos no mesmo local). */
export function groupConsecutiveBySite(rows: TicketRow[]): TicketGroup[] {
  const out: TicketGroup[] = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last && r.siteId && last.siteId === r.siteId) last.rows.push(r);
    else out.push({ siteId: r.siteId, rows: [r] });
  }
  return out;
}

export function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(now),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "técnico";
