"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { commissionEntries, workOrderMaterials, workOrderPhotos, workOrderTasks } from "@/db/schema";
import { runAction, zodFieldErrors } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { formatOM } from "@/lib/format";
import { dataUrlToBlob, deleteStoredFile, MAX_UPLOAD_BYTES, storeFile } from "@/lib/storage";
import { MAX_UPLOAD_LABEL } from "@/lib/upload";
import {
  addWorkOrderMaterial,
  changeWorkOrderStatus,
  completeWorkOrder,
  logEvent,
  removeWorkOrderMaterial,
  setTaskDone,
} from "@/server/work-orders";
import { notifyStaff } from "@/server/notify";
import { actorOf, ownedTask, ownedWorkOrder, technicianFor } from "../../_lib/guard";
import { nextWorkOrderId } from "../../_lib/queries";
import {
  SESSION_LOST,
  type CompletePayload,
  type CompleteState,
  type PhotoPayload,
  type PhotoState,
  type StatusPayload,
  type TaskPayload,
  type TechState,
} from "../../_lib/types";

const coord = z.number().finite().nullable().optional();
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

function refresh() {
  revalidatePath("/tecnico", "layout");
}

const CLOSED = new Set(["concluida", "cancelada"]);

/* ───────────────────────── Status ───────────────────────── */

const statusSchema = z.object({
  workOrderId: z.uuid(),
  to: z.enum(["em_deslocamento", "em_execucao", "pausada", "aguardando_material"]),
  note: text(500),
  lat: coord,
  lng: coord,
  clientAt: z.number().int().positive().optional(),
});

const STATUS_DONE: Record<StatusPayload["to"], string> = {
  em_deslocamento: "Cliente avisado: você está a caminho",
  em_execucao: "Atendimento iniciado",
  pausada: "Atendimento pausado",
  aguardando_material: "OM marcada como aguardando material",
};

/** Muda o status da OM do técnico (a caminho, iniciar, pausar, aguardando material). */
export async function changeStatusAction(input: StatusPayload): Promise<TechState> {
  const user = await assertRole(["tecnico", "admin", "gestor"]).catch(() => null);
  if (!user) return SESSION_LOST;
  return runAction(async () => {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Não foi possível mudar o status: dados inválidos." };
    const { workOrderId, to, note } = parsed.data;
    const technician = await technicianFor(user);
    const wo = await ownedWorkOrder(workOrderId, technician.id);
    if (wo.status === to) return { ok: true, message: STATUS_DONE[to] };
    await db.transaction(async (tx) => {
      await changeWorkOrderStatus(tx, wo.id, to, actorOf(user, parsed.data), note ?? undefined);
      // "Não consegui atender": o escritório precisa saber para reagendar ou providenciar material
      if ((to === "pausada" || to === "aguardando_material") && note) {
        await notifyStaff(tx, {
          title: `${formatOM(wo.number)} ${to === "pausada" ? "pausada" : "aguardando material"} por ${technician.name.split(" ")[0]}`,
          body: note,
          link: `/admin/oms/${wo.id}`,
        });
      }
    });
    refresh();
    return { ok: true, message: STATUS_DONE[to] };
  });
}

/* ───────────────────────── Checklist ───────────────────────── */

const taskSchema = z.object({
  taskId: z.uuid(),
  done: z.boolean(),
  measurementValue: text(60),
  notes: text(1000),
});

/** Marca/desmarca item do checklist com medição e observação (estado completo, idempotente). */
export async function setTaskAction(input: TaskPayload): Promise<TechState> {
  const user = await assertRole(["tecnico", "admin", "gestor"]).catch(() => null);
  if (!user) return SESSION_LOST;
  return runAction(async () => {
    const parsed = taskSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Item do checklist inválido." };
    const technician = await technicianFor(user);
    const { task } = await ownedTask(parsed.data.taskId, technician.id);
    if (parsed.data.done && task.measurementUnit && !parsed.data.measurementValue) {
      return { ok: false, error: `Registre a medição (${task.measurementUnit}) de "${task.title}" antes de marcar.` };
    }
    await setTaskDone(db, task.id, {
      done: parsed.data.done,
      measurementValue: parsed.data.measurementValue,
      notes: parsed.data.notes,
    });
    refresh();
    return { ok: true };
  });
}

/* ───────────────────────── Fotos ───────────────────────── */

const photoSchema = z.object({
  workOrderId: z.uuid(),
  kind: z.enum(["antes", "depois", "problema", "outro"]),
  taskId: z.uuid().nullable().optional(),
  dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/, "Envie uma foto (JPEG, PNG ou WebP)."),
  clientId: z.string().max(64).optional(),
  clientAt: z.number().int().positive().optional(),
});

const KIND_LABEL = { antes: "antes", depois: "depois", problema: "do problema", outro: "" } as const;

/** Envia uma foto da OM (já reduzida no aparelho). */
export async function addPhotoAction(input: PhotoPayload): Promise<PhotoState> {
  const user = await assertRole(["tecnico", "admin", "gestor"]).catch(() => null);
  if (!user) return SESSION_LOST;
  return runAction(async () => {
    const parsed = photoSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Foto inválida." };
    const technician = await technicianFor(user);
    const wo = await ownedWorkOrder(parsed.data.workOrderId, technician.id);
    if (CLOSED.has(wo.status)) return { ok: false, error: "A OM já foi encerrada; não é possível adicionar fotos." };
    let taskId: string | null = parsed.data.taskId ?? null;
    if (taskId) {
      const task = await db.query.workOrderTasks.findFirst({ where: eq(workOrderTasks.id, taskId), columns: { workOrderId: true } });
      if (task?.workOrderId !== wo.id) taskId = null;
    }
    if (parsed.data.clientId) {
      // reenvio de uma foto que já chegou (a resposta se perdeu): devolve a existente
      const existing = await db.query.workOrderPhotos.findFirst({ where: eq(workOrderPhotos.clientId, parsed.data.clientId) });
      if (existing && existing.workOrderId === wo.id) {
        return { ok: true, message: "Foto enviada", photo: { id: existing.id, url: existing.url, kind: existing.kind, taskId: existing.taskId } };
      }
    }
    const blob = dataUrlToBlob(parsed.data.dataUrl);
    if (blob.size > MAX_UPLOAD_BYTES) return { ok: false, error: `A foto passou de ${MAX_UPLOAD_LABEL}. Tire de novo com menos zoom.` };
    const url = await storeFile("om", blob, `foto.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`);
    const photo = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(workOrderPhotos)
        .values({ workOrderId: wo.id, taskId, url, kind: parsed.data.kind, takenById: user.id, clientId: parsed.data.clientId ?? null })
        .returning();
      await logEvent(tx, wo.id, {
        kind: "photo",
        message: `Foto ${KIND_LABEL[parsed.data.kind]}`.trim() + " adicionada.",
        actor: actorOf(user, parsed.data),
      });
      return p;
    });
    refresh();
    return { ok: true, message: "Foto enviada", photo: { id: photo.id, url: photo.url, kind: photo.kind, taskId: photo.taskId } };
  });
}

/** Remove uma foto da OM (enquanto ela não foi encerrada). */
export async function removePhotoAction(photoId: string): Promise<TechState> {
  const user = await assertRole(["tecnico", "admin", "gestor"]).catch(() => null);
  if (!user) return SESSION_LOST;
  return runAction(async () => {
    if (!z.uuid().safeParse(photoId).success) return { ok: false, error: "Foto não encontrada." };
    const technician = await technicianFor(user);
    const photo = await db.query.workOrderPhotos.findFirst({ where: eq(workOrderPhotos.id, photoId) });
    if (!photo) return { ok: false, error: "Foto não encontrada." };
    const wo = await ownedWorkOrder(photo.workOrderId, technician.id);
    if (CLOSED.has(wo.status)) return { ok: false, error: "A OM já foi encerrada; as fotos não podem mais ser removidas." };
    await db.transaction(async (tx) => {
      await tx.delete(workOrderPhotos).where(eq(workOrderPhotos.id, photo.id));
      await logEvent(tx, wo.id, { kind: "photo", message: "Foto removida.", actor: actorOf(user) });
    });
    await deleteStoredFile(photo.url);
    refresh();
    return { ok: true, message: "Foto removida" };
  });
}

/* ───────────────────────── Materiais ───────────────────────── */

const materialSchema = z.object({
  workOrderId: z.uuid(),
  productId: z.uuid({ message: "Escolha um material." }),
  quantity: z.number({ message: "Informe a quantidade." }).positive("Informe uma quantidade maior que zero.").max(9999, "Quantidade alta demais."),
  chargeCustomer: z.boolean(),
  clientId: z.uuid().optional(),
});

/** Lança material aplicado (baixa no estoque do veículo do técnico). */
export async function addMaterialAction(input: z.input<typeof materialSchema>): Promise<TechState> {
  const user = await assertRole(["tecnico", "admin", "gestor"]).catch(() => null);
  if (!user) return SESSION_LOST;
  return runAction(async () => {
    const parsed = materialSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Material inválido.", fieldErrors: zodFieldErrors(parsed.error) };
    const technician = await technicianFor(user);
    const wo = await ownedWorkOrder(parsed.data.workOrderId, technician.id);
    await db.transaction((tx) =>
      addWorkOrderMaterial(
        tx,
        wo.id,
        {
          productId: parsed.data.productId,
          quantity: parsed.data.quantity,
          chargeCustomer: parsed.data.chargeCustomer,
          clientId: parsed.data.clientId,
        },
        actorOf(user),
      ),
    );
    refresh();
    return { ok: true, message: "Material lançado" };
  });
}

/** Remove material lançado (estorna para o estoque de onde saiu). */
export async function removeMaterialAction(materialId: string): Promise<TechState> {
  const user = await assertRole(["tecnico", "admin", "gestor"]).catch(() => null);
  if (!user) return SESSION_LOST;
  return runAction(async () => {
    if (!z.uuid().safeParse(materialId).success) return { ok: false, error: "Material não encontrado." };
    const technician = await technicianFor(user);
    const m = await db.query.workOrderMaterials.findFirst({ where: eq(workOrderMaterials.id, materialId) });
    if (!m) return { ok: false, error: "Material não encontrado." };
    await ownedWorkOrder(m.workOrderId, technician.id);
    await db.transaction((tx) => removeWorkOrderMaterial(tx, m.id, actorOf(user)));
    refresh();
    return { ok: true, message: "Material removido" };
  });
}

/* ───────────────────────── Conclusão ───────────────────────── */

const completeSchema = z
  .object({
    workOrderId: z.uuid(),
    solution: z.string().trim().min(3, "Descreva o que foi feito.").max(4000, "Use no máximo 4000 caracteres."),
    diagnosis: text(4000),
    technicianNotes: text(4000),
    signedByName: text(120),
    signature: z
      .string()
      .regex(/^data:image\/png;base64,/, "Assinatura inválida. Limpe e assine de novo.")
      .max(3_000_000, "A assinatura ficou grande demais. Limpe e assine de novo.")
      .nullable()
      .optional(),
    lat: coord,
    lng: coord,
  })
  .refine((d) => !d.signature || (d.signedByName?.length ?? 0) >= 2, {
    path: ["signedByName"],
    message: "Informe o nome de quem assinou.",
  });

/** Conclui a OM: assinatura (PNG), validação do checklist, totais, cobrança avulsa e comissão. */
export async function completeAction(input: CompletePayload): Promise<CompleteState> {
  const user = await assertRole(["tecnico", "admin", "gestor"]).catch(() => null);
  if (!user) return SESSION_LOST;
  const result: CompleteState = await runAction(async () => {
    const parsed = completeSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Revise os campos da conclusão.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    const d = parsed.data;
    const technician = await technicianFor(user);
    const wo = await ownedWorkOrder(d.workOrderId, technician.id);
    if (wo.status !== "em_execucao") {
      return { ok: false, error: wo.status === "pausada" ? "Retome o atendimento antes de concluir." : "A OM precisa estar em execução para ser concluída." };
    }

    // Confere o checklist antes de gravar a assinatura (evita arquivo órfão e devolve os itens pendentes).
    const tasks = await db.query.workOrderTasks.findMany({
      where: eq(workOrderTasks.workOrderId, wo.id),
      orderBy: (t, { asc }) => [asc(t.position)],
    });
    const pending = tasks.filter((t) => !t.done);
    if (pending.length) {
      return {
        ok: false,
        error: `Faltam ${pending.length} item(ns) do checklist: ${pending.slice(0, 3).map((t) => t.title).join(", ")}.`,
        pendingTaskIds: pending.map((t) => t.id),
      };
    }
    const missing = tasks.filter((t) => t.measurementUnit && !t.measurementValue?.trim());
    if (missing.length) {
      return {
        ok: false,
        error: `Registre a medição de: ${missing.map((t) => t.title).join(", ")}.`,
        pendingTaskIds: missing.map((t) => t.id),
      };
    }

    const signatureUrl = d.signature ? await storeFile("assinaturas", dataUrlToBlob(d.signature), "assinatura.png") : null;
    const actor = actorOf(user, d);
    await db.transaction(async (tx) => {
      await completeWorkOrder(
        tx,
        wo.id,
        {
          solution: d.solution,
          diagnosis: d.diagnosis,
          technicianNotes: d.technicianNotes,
          signatureUrl,
          signedByName: d.signature ? d.signedByName : null,
        },
        actor,
      );
      if (signatureUrl) {
        await logEvent(tx, wo.id, { kind: "signature", message: `Assinado por ${d.signedByName}.`, actor });
      }
    });

    const [commission, nextId] = await Promise.all([
      db.query.commissionEntries.findFirst({
        where: and(
          eq(commissionEntries.workOrderId, wo.id),
          eq(commissionEntries.technicianId, technician.id),
          ne(commissionEntries.status, "cancelada"),
        ),
        columns: { amount: true, status: true },
      }),
      nextWorkOrderId(technician.id, todayISO(), wo.id),
    ]);
    return {
      ok: true,
      message: "OM concluída",
      commission: commission?.amount ?? null,
      commissionStatus: commission?.status ?? null,
      nextId,
    };
  });
  if (result.ok) refresh();
  return result;
}
