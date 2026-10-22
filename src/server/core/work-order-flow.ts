export type WorkOrderStatus =
  | "aberta"
  | "agendada"
  | "em_deslocamento"
  | "em_execucao"
  | "pausada"
  | "aguardando_material"
  | "concluida"
  | "cancelada";

/** Transições permitidas da OM. */
export const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  aberta: ["agendada", "em_deslocamento", "em_execucao", "cancelada", "aguardando_material"],
  agendada: ["aberta", "em_deslocamento", "em_execucao", "cancelada", "aguardando_material"],
  em_deslocamento: ["em_execucao", "agendada", "pausada", "cancelada"],
  em_execucao: ["pausada", "aguardando_material", "concluida"],
  pausada: ["em_execucao", "em_deslocamento", "aguardando_material", "cancelada"],
  aguardando_material: ["agendada", "em_deslocamento", "em_execucao", "cancelada"],
  // reabrir uma OM concluída só por reopenWorkOrder (estorna a comissão)
  concluida: [],
  cancelada: ["aberta"],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Ação principal do app do técnico para cada estado (o "botão grande"). */
export function primaryAction(status: WorkOrderStatus): { to: WorkOrderStatus; label: string } | null {
  switch (status) {
    case "aberta":
    case "agendada":
    case "aguardando_material":
      return { to: "em_deslocamento", label: "Estou a caminho" };
    case "em_deslocamento":
      return { to: "em_execucao", label: "Cheguei, iniciar atendimento" };
    case "pausada":
      return { to: "em_execucao", label: "Retomar atendimento" };
    case "em_execucao":
      return { to: "concluida", label: "Concluir OM" };
    default:
      return null;
  }
}

export const FINAL_STATUSES: WorkOrderStatus[] = ["concluida", "cancelada"];
export const ACTIVE_STATUSES: WorkOrderStatus[] = [
  "aberta",
  "agendada",
  "em_deslocamento",
  "em_execucao",
  "pausada",
  "aguardando_material",
];
