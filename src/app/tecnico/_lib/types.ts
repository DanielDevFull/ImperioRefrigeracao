import type { ActionState } from "@/lib/action";

/** Resposta das ações do técnico. `retry` = falha temporária (ex.: sessão expirou): a fila guarda e tenta depois. */
export type TechState = ActionState & { retry?: boolean };

export type CompleteState = TechState & {
  commission?: number | null;
  commissionStatus?: string | null;
  nextId?: string | null;
  pendingTaskIds?: string[];
};

export type PhotoState = TechState & {
  photo?: { id: string; url: string; kind: string; taskId: string | null };
};

export type StatusPayload = {
  workOrderId: string;
  to: "em_deslocamento" | "em_execucao" | "pausada" | "aguardando_material";
  note?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type TaskPayload = {
  taskId: string;
  workOrderId: string;
  done: boolean;
  measurementValue: string | null;
  notes: string | null;
};

export type PhotoPayload = {
  workOrderId: string;
  kind: "antes" | "depois" | "problema" | "outro";
  taskId: string | null;
  dataUrl: string;
};

export type CompletePayload = {
  workOrderId: string;
  solution: string;
  diagnosis: string | null;
  technicianNotes: string | null;
  signedByName: string | null;
  signature: string | null;
  lat?: number | null;
  lng?: number | null;
};

export const SESSION_LOST: TechState = {
  ok: false,
  retry: true,
  error: "Sua sessão expirou. Entre novamente para enviar as alterações guardadas no aparelho.",
};
