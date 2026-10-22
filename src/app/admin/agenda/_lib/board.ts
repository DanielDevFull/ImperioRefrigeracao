/** Tipos e regras puras do quadro de despacho (seguro para o cliente). */

export type BoardItem = {
  id: string;
  number: number;
  title: string;
  type: string;
  status: string;
  priority: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  technicianId: string | null;
  /** Nome do técnico atribuído no banco (também de técnico desativado, que não tem linha no quadro). */
  technicianName: string | null;
  customerName: string;
  equipmentLabel: string | null;
  minutes: number;
};

export type BoardTechnician = {
  id: string;
  name: string;
  color: string;
  absences: { startDate: string; endDate: string; reason: string | null }[];
};

/** Em campo, concluída ou cancelada: não pode ser arrastada. */
export const LOCKED = new Set(["em_deslocamento", "em_execucao", "concluida", "cancelada"]);
export const ACTIVE = new Set(["aberta", "agendada", "em_deslocamento", "em_execucao", "pausada", "aguardando_material"]);

export function isLate(item: Pick<BoardItem, "status" | "scheduledDate">, today: string) {
  return ACTIVE.has(item.status) && !!item.scheduledDate && item.scheduledDate < today;
}

/** Vai para a bandeja: sem técnico, sem data, ou atrasada e ainda movível. */
export function needsDispatch(item: BoardItem, today: string) {
  if (!ACTIVE.has(item.status)) return false;
  if (!item.technicianId || !item.scheduledDate) return true;
  return isLate(item, today) && !LOCKED.has(item.status);
}

export function absenceOn(tech: BoardTechnician, date: string) {
  return tech.absences.find((a) => date >= a.startDate && date <= a.endDate) ?? null;
}

export const DEFAULT_MINUTES: Record<string, number> = {
  preventiva: 60,
  pmoc: 90,
  corretiva: 90,
  instalacao: 180,
  visita_tecnica: 60,
};

export function minutesOf(time: string | null) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatHours(minutes: number) {
  const h = minutes / 60;
  return `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

/** Janela do dia na visão diária. */
export const DAY_START = 7 * 60;
export const DAY_END = 20 * 60;
