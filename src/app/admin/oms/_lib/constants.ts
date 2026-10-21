/** Constantes do módulo de OMs (seguras para importar no cliente). */

export const STATUS_GROUPS = [
  { value: "sem-tecnico", label: "Abertas sem técnico" },
  { value: "agendadas", label: "Agendadas" },
  { value: "em-campo", label: "Em campo" },
  { value: "aguardando", label: "Aguardando material" },
  { value: "concluidas", label: "Concluídas" },
  { value: "canceladas", label: "Canceladas" },
  { value: "", label: "Todas" },
] as const;

export type StatusGroup = (typeof STATUS_GROUPS)[number]["value"];

export const WORK_ORDER_TYPES = [
  { value: "corretiva", label: "Corretiva" },
  { value: "preventiva", label: "Preventiva" },
  { value: "instalacao", label: "Instalação" },
  { value: "visita_tecnica", label: "Visita técnica" },
  { value: "pmoc", label: "PMOC" },
] as const;

export const PRIORITIES = [
  { value: "baixa", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
] as const;

export const ORIGINS = [
  { value: "manual", label: "Manual" },
  { value: "automatica", label: "Automática" },
  { value: "portal_cliente", label: "Portal do cliente" },
] as const;

/** Tipos que normalmente geram cobrança avulsa ao concluir. */
export const BILLABLE_BY_DEFAULT = new Set(["corretiva", "instalacao", "visita_tecnica"]);

/** Estados em que a OM não pode mais ser reatribuída/reagendada (regra do assignWorkOrder). */
export const NOT_ASSIGNABLE = new Set(["em_execucao", "concluida", "cancelada"]);

/** Estados em que o checklist pode ser preenchido (regra do setTaskDone). */
export const CHECKLIST_OPEN = new Set(["em_execucao", "pausada"]);

export const PHOTO_KINDS = [
  { value: "antes", label: "Antes" },
  { value: "depois", label: "Depois" },
  { value: "problema", label: "Problema" },
  { value: "outro", label: "Outro" },
] as const;

export const photoKindLabel: Record<string, string> = Object.fromEntries(PHOTO_KINDS.map((k) => [k.value, k.label]));

/** Rótulo do botão para cada transição de status disparada pela central. */
export function transitionLabel(from: string, to: string) {
  switch (to) {
    case "aberta":
      return from === "cancelada" ? "Reativar OM" : "Voltar para aberta";
    case "agendada":
      return from === "aguardando_material" ? "Material chegou, reagendar" : "Marcar como agendada";
    case "em_deslocamento":
      return "Marcar técnico a caminho";
    case "em_execucao":
      return from === "pausada" || from === "aguardando_material" ? "Retomar atendimento" : "Iniciar atendimento";
    case "pausada":
      return "Pausar atendimento";
    case "aguardando_material":
      return "Marcar aguardando material";
    case "cancelada":
      return "Cancelar OM";
    default:
      return to;
  }
}

export function parseOmNumber(q: string) {
  const m = /^\s*(?:om[-\s]?)?0*(\d{1,9})\s*$/i.exec(q);
  return m ? Number(m[1]) : null;
}

export const isUuid = (v: string | null | undefined): v is string =>
  !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const isISODate = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
