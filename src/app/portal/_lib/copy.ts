/**
 * Textos do portal do cliente: estados das OMs em linguagem simples,
 * linha do tempo, opções do formulário de chamado e utilitários de exibição.
 * Arquivo puro (usado por componentes de servidor e de cliente).
 */
import { TZ } from "@/lib/dates";
import { formatDate, formatLongDate, formatTime } from "@/lib/format";
import type { Tone } from "@/lib/labels";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Limite de upload por envio (o mesmo MAX_UPLOAD_BYTES das ações; abaixo do teto de 4,5 MB da Vercel). */
export { MAX_UPLOAD_BYTES as UPLOAD_LIMIT_BYTES, MAX_UPLOAD_LABEL as UPLOAD_LIMIT_LABEL } from "@/lib/upload";
export const MAX_REQUEST_PHOTOS = 3;

export function firstName(name: string | null | undefined) {
  const n = name?.trim();
  return n ? n.split(/\s+/)[0] : null;
}

/** "18 de novembro" */
export function formatDayMonthLong(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "numeric", month: "long" }).format(d);
}

/** "quarta-feira" */
export function formatWeekday(value: string | Date | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long" }).format(d);
}

export function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

type WoLike = {
  status: string;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  finishedAt?: Date | string | null;
};

export type CustomerStatus = { label: string; tone: Tone; live: boolean; detail: string };

/** Estado da OM contado para o cliente, sem jargão interno. */
export function describeStatus(wo: WoLike, technicianFirstName?: string | null): CustomerStatus {
  const tech = technicianFirstName ?? null;
  const when = wo.scheduledDate
    ? `${formatLongDate(wo.scheduledDate)}${wo.scheduledTime ? `, às ${formatTime(wo.scheduledTime)}` : ""}`
    : null;
  switch (wo.status) {
    case "aberta":
      return {
        label: "Recebido",
        tone: "frost",
        live: false,
        detail: "Recebemos o pedido e vamos marcar a visita. A data aparece aqui assim que for definida.",
      };
    case "agendada":
      return {
        label: "Visita agendada",
        tone: "violet",
        live: false,
        detail: when
          ? `Marcada para ${when}${tech ? `, com ${tech}` : ""}.`
          : "A visita está agendada. Avisaremos a data por aqui.",
      };
    case "em_deslocamento":
      return {
        label: "Técnico a caminho",
        tone: "ice",
        live: true,
        detail: `${tech ?? "O técnico"} já saiu para o seu endereço.`,
      };
    case "em_execucao":
      return {
        label: "Em atendimento",
        tone: "ice",
        live: true,
        detail: `${tech ?? "O técnico"} está trabalhando no equipamento agora.`,
      };
    case "pausada":
      return {
        label: "Atendimento pausado",
        tone: "brass",
        live: false,
        detail: "O atendimento foi pausado e será retomado em seguida.",
      };
    case "aguardando_material":
      return {
        label: "Aguardando peça",
        tone: "brass",
        live: false,
        detail: "Estamos providenciando a peça ou o material necessário. Avisaremos a nova data.",
      };
    case "concluida":
      return {
        label: "Concluído",
        tone: "mint",
        live: false,
        detail: wo.finishedAt ? `Finalizado em ${formatDate(wo.finishedAt)}.` : "Atendimento finalizado.",
      };
    case "cancelada":
      return { label: "Cancelado", tone: "steel", live: false, detail: "Este atendimento foi cancelado." };
    default:
      return { label: wo.status, tone: "steel", live: false, detail: "" };
  }
}

type EventLike = { kind: string; fromStatus: string | null; toStatus: string | null };

/** Linha do tempo para o cliente: só eventos que fazem sentido para ele. */
export function timelineLabel(e: EventLike, origin: string): { title: string; tone: Tone } | null {
  switch (e.kind) {
    case "created":
      if (origin === "portal_cliente") return { title: "Você abriu o chamado", tone: "frost" };
      if (origin === "automatica") return { title: "Visita programada pelo plano de manutenção", tone: "violet" };
      return { title: "Atendimento registrado pela Imperium", tone: "frost" };
    case "assigned":
      return { title: "Técnico definido para a visita", tone: "violet" };
    case "rescheduled":
      return { title: "Visita reagendada", tone: "violet" };
    case "signature":
      return { title: "Serviço assinado no local", tone: "mint" };
    case "status":
      switch (e.toStatus) {
        case "aberta":
          return { title: "Aguardando agendamento", tone: "frost" };
        case "agendada":
          return { title: "Visita agendada", tone: "violet" };
        case "em_deslocamento":
          return { title: "Técnico a caminho", tone: "ice" };
        case "em_execucao":
          if (e.fromStatus === "pausada") return { title: "Atendimento retomado", tone: "ice" };
          if (e.fromStatus === "concluida") return { title: "Atendimento reaberto", tone: "brass" };
          return { title: "Técnico chegou e iniciou o atendimento", tone: "ice" };
        case "pausada":
          return { title: "Atendimento pausado", tone: "brass" };
        case "aguardando_material":
          return { title: "Aguardando peça ou material", tone: "brass" };
        case "concluida":
          return { title: "Atendimento concluído", tone: "mint" };
        case "cancelada":
          return { title: "Atendimento cancelado", tone: "steel" };
        default:
          return null;
      }
    default:
      return null;
  }
}

export const PROBLEM_CHIPS = [
  "Não gela",
  "Pingando água",
  "Barulho",
  "Cheiro ruim",
  "Não liga",
  "Instalação/remoção",
  "Outro",
] as const;
export type ProblemChip = (typeof PROBLEM_CHIPS)[number];

export const URGENCY_OPTIONS = [
  { value: "normal", label: "Normal", hint: "Pode ser nos próximos dias." },
  { value: "alta", label: "Alta", hint: "Está atrapalhando a rotina." },
  { value: "urgente", label: "Urgente", hint: "Parou em um local crítico." },
] as const;

export const RATING_LABELS: Record<number, string> = {
  1: "Ruim",
  2: "Regular",
  3: "Bom",
  4: "Muito bom",
  5: "Excelente",
};

export const workOrderTypeForCustomer: Record<string, string> = {
  preventiva: "Manutenção preventiva",
  corretiva: "Atendimento corretivo",
  instalacao: "Instalação",
  visita_tecnica: "Visita técnica",
  pmoc: "Rotina do PMOC",
};
