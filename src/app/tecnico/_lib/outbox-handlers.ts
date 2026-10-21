"use client";

import { registerOutboxHandlers } from "@/lib/offline/outbox";
import { addPhotoAction, changeStatusAction, setTaskAction } from "../om/[id]/actions";

/** Tipos de alteração que passam pela fila offline, e a Server Action de cada um. */
export const OUTBOX_KIND = {
  status: "om.status",
  task: "om.task",
  photo: "om.photo",
} as const;

registerOutboxHandlers({
  [OUTBOX_KIND.status]: changeStatusAction,
  [OUTBOX_KIND.task]: setTaskAction,
  [OUTBOX_KIND.photo]: addPhotoAction,
});

/** O checklist guarda só o último estado de cada item; status e fotos não têm chave (todos vão, em ordem). */
export const taskKey = (taskId: string) => `task:${taskId}`;
