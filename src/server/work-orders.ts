import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  equipment,
  financeCategories,
  maintenancePlans,
  maintenancePlanTasks,
  products,
  receivables,
  workOrderEvents,
  workOrderMaterials,
  workOrderTasks,
  workOrders,
} from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import { formatOM } from "@/lib/format";
import { labelOf, workOrderStatus as statusLabels } from "@/lib/labels";
import { round2 } from "./core/billing";
import { canTransition, type WorkOrderStatus } from "./core/work-order-flow";
import {
  cancelCommissionsForWorkOrder,
  createCommissionForWorkOrder,
  materialsChargedFor,
} from "./commissions";
import { notifyCustomer, notifyTechnician } from "./notify";
import { getSettings } from "./settings";
import { defaultLocationFor, ensureReorderRequests, moveStock } from "./stock";

type DbLike = Tx | typeof db;

export type Actor = {
  userId: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Momento real da ação (ex.: registrada offline e enviada depois) */
  at?: Date | null;
};

/** Momento da ação: o informado pelo aparelho, limitado a 7 dias atrás e nunca no futuro. */
export function actionTime(actor?: Actor) {
  const now = new Date();
  const at = actor?.at;
  if (!at || Number.isNaN(at.getTime())) return now;
  if (at > now || now.getTime() - at.getTime() > 7 * 86_400_000) return now;
  return at;
}

export async function logEvent(
  tx: DbLike,
  workOrderId: string,
  e: {
    kind: string;
    message?: string | null;
    fromStatus?: WorkOrderStatus | null;
    toStatus?: WorkOrderStatus | null;
    actor?: Actor;
  },
) {
  await tx.insert(workOrderEvents).values({
    workOrderId,
    kind: e.kind,
    message: e.message ?? null,
    fromStatus: e.fromStatus ?? null,
    toStatus: e.toStatus ?? null,
    userId: e.actor?.userId ?? null,
    lat: e.actor?.lat ?? null,
    lng: e.actor?.lng ?? null,
    createdAt: actionTime(e.actor),
  });
}

export type CreateWorkOrderInput = {
  type: "preventiva" | "corretiva" | "instalacao" | "visita_tecnica" | "pmoc";
  origin?: "manual" | "portal_cliente" | "automatica";
  priority?: "baixa" | "normal" | "alta" | "urgente";
  customerId: string;
  siteId?: string | null;
  equipmentId?: string | null;
  maintenancePlanId?: string | null;
  contractEquipmentId?: string | null;
  technicianId?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  dueDate?: string | null;
  title: string;
  description?: string | null;
  laborAmount?: number;
  billable?: boolean;
};

/** Cria uma OM (manual, pelo portal ou pelo gerador), copiando o checklist do plano quando houver. */
export async function createWorkOrder(
  tx: DbLike,
  input: CreateWorkOrderInput,
  actor: Actor,
  taskFilter?: (t: typeof maintenancePlanTasks.$inferSelect) => boolean,
) {
  let siteId = input.siteId ?? null;
  if (!siteId && input.equipmentId) {
    const eq_ = await tx.query.equipment.findFirst({ where: eq(equipment.id, input.equipmentId), columns: { siteId: true } });
    siteId = eq_?.siteId ?? null;
  }
  let labor = input.laborAmount ?? 0;
  if (input.maintenancePlanId && input.laborAmount == null) {
    const plan = await tx.query.maintenancePlans.findFirst({ where: eq(maintenancePlans.id, input.maintenancePlanId) });
    labor = plan?.visitReferenceValue ?? 0;
  }
  const status: WorkOrderStatus = input.technicianId && input.scheduledDate ? "agendada" : "aberta";

  const [wo] = await tx
    .insert(workOrders)
    .values({
      type: input.type,
      origin: input.origin ?? "manual",
      priority: input.priority ?? "normal",
      status,
      customerId: input.customerId,
      siteId,
      equipmentId: input.equipmentId ?? null,
      maintenancePlanId: input.maintenancePlanId ?? null,
      contractEquipmentId: input.contractEquipmentId ?? null,
      technicianId: input.technicianId ?? null,
      scheduledDate: input.scheduledDate ?? null,
      scheduledTime: input.scheduledTime ?? null,
      dueDate: input.dueDate ?? null,
      title: input.title,
      description: input.description ?? null,
      laborAmount: labor,
      billable: input.billable ?? false,
      createdById: actor.userId,
    })
    .onConflictDoNothing()
    .returning();
  if (!wo) return null;

  if (input.maintenancePlanId) {
    const tasks = await tx.query.maintenancePlanTasks.findMany({
      where: eq(maintenancePlanTasks.planId, input.maintenancePlanId),
      orderBy: (t, { asc }) => [asc(t.position)],
    });
    const chosen = taskFilter ? tasks.filter(taskFilter) : tasks;
    if (chosen.length) {
      await tx.insert(workOrderTasks).values(
        chosen.map((t, i) => ({
          workOrderId: wo.id,
          planTaskId: t.id,
          position: i,
          title: t.title,
          instructions: t.instructions,
          measurementUnit: t.measurementUnit,
          requiresPhoto: t.requiresPhoto,
        })),
      );
    }
  }

  await logEvent(tx, wo.id, {
    kind: "created",
    toStatus: status,
    message:
      input.origin === "automatica"
        ? "Gerada automaticamente pelo plano de manutenção."
        : input.origin === "portal_cliente"
          ? "Chamado aberto pelo cliente no portal."
          : "OM criada.",
    actor,
  });
  if (wo.technicianId) {
    await notifyTechnician(tx, wo.technicianId, {
      title: `Nova OM ${formatOM(wo.number)}`,
      body: wo.title,
      link: `/tecnico/om/${wo.id}`,
    });
  }
  return wo;
}

/** Volta o equipamento para "ativo" se nenhuma outra OM estiver em execução nele. */
async function releaseEquipmentIfIdle(tx: DbLike, equipmentId: string | null, exceptWorkOrderId: string) {
  if (!equipmentId) return;
  const busy = await tx.query.workOrders.findFirst({
    where: and(
      eq(workOrders.equipmentId, equipmentId),
      ne(workOrders.id, exceptWorkOrderId),
      inArray(workOrders.status, ["em_execucao", "pausada"]),
    ),
    columns: { id: true },
  });
  if (busy) return;
  await tx
    .update(equipment)
    .set({ status: "ativo" })
    .where(and(eq(equipment.id, equipmentId), eq(equipment.status, "em_manutencao")));
}

export async function getWorkOrderOrThrow(tx: DbLike, id: string) {
  const wo = await tx.query.workOrders.findFirst({ where: eq(workOrders.id, id) });
  if (!wo) throw new Error("OM não encontrada.");
  return wo;
}

/** Muda o status validando o fluxo; registra horários, localização e avisa o cliente. */
export async function changeWorkOrderStatus(
  tx: DbLike,
  id: string,
  to: WorkOrderStatus,
  actor: Actor,
  note?: string,
) {
  const wo = await getWorkOrderOrThrow(tx, id);
  const from = wo.status as WorkOrderStatus;
  if (from === to) return wo;
  if (to === "concluida") throw new Error("Use a conclusão da OM para finalizar.");
  if (!canTransition(from, to)) {
    throw new Error(`Não é possível ir de "${labelOf(statusLabels, from).label}" para "${labelOf(statusLabels, to).label}".`);
  }
  const now = actionTime(actor);
  const patch: Partial<typeof workOrders.$inferInsert> = { status: to };
  if (to === "em_deslocamento") patch.travelStartedAt = now;
  if (to === "em_execucao" && !wo.startedAt) {
    patch.startedAt = now;
    patch.checkInLat = actor.lat ?? null;
    patch.checkInLng = actor.lng ?? null;
  }
  if (to === "agendada" && !wo.technicianId) throw new Error("Atribua um técnico antes de agendar.");
  if (to === "cancelada") await reverseWorkOrderMaterials(tx, wo.id, actor);

  const [updated] = await tx.update(workOrders).set(patch).where(eq(workOrders.id, id)).returning();
  await logEvent(tx, id, { kind: "status", fromStatus: from, toStatus: to, message: note ?? null, actor });

  if (to === "cancelada") {
    await cancelCommissionsForWorkOrder(tx, id);
    await releaseEquipmentIfIdle(tx, wo.equipmentId, id);
  }
  if (to === "em_execucao" && wo.equipmentId) {
    await tx.update(equipment).set({ status: "em_manutencao" }).where(and(eq(equipment.id, wo.equipmentId), eq(equipment.status, "ativo")));
  }
  if (to === "em_deslocamento") {
    await notifyCustomer(tx, wo.customerId, {
      title: "Técnico a caminho",
      body: `${formatOM(wo.number)} — ${wo.title}`,
      link: `/portal/atendimentos/${wo.id}`,
    });
  }
  return updated;
}

export type CompleteInput = {
  solution?: string | null;
  diagnosis?: string | null;
  technicianNotes?: string | null;
  signatureUrl?: string | null;
  signedByName?: string | null;
};

/** Conclui a OM: valida o checklist, calcula totais, gera cobrança avulsa e comissão. */
export async function completeWorkOrder(tx: DbLike, id: string, input: CompleteInput, actor: Actor) {
  const wo = await getWorkOrderOrThrow(tx, id);
  if (!canTransition(wo.status as WorkOrderStatus, "concluida")) {
    throw new Error("A OM precisa estar em execução para ser concluída.");
  }
  const tasks = await tx.query.workOrderTasks.findMany({ where: eq(workOrderTasks.workOrderId, id) });
  const pending = tasks.filter((t) => !t.done);
  if (pending.length) {
    throw new Error(`Faltam ${pending.length} item(ns) do checklist: ${pending.slice(0, 3).map((t) => t.title).join(", ")}.`);
  }
  const missingMeasure = tasks.filter((t) => t.measurementUnit && !t.measurementValue?.trim());
  if (missingMeasure.length) {
    throw new Error(`Registre a medição de: ${missingMeasure.map((t) => t.title).join(", ")}.`);
  }

  const materialsCharged = await materialsChargedFor(tx, id);
  const total = round2((wo.billable ? wo.laborAmount : 0) + materialsCharged);
  const now = actionTime(actor);

  const [updated] = await tx
    .update(workOrders)
    .set({
      status: "concluida",
      finishedAt: now,
      checkOutLat: actor.lat ?? null,
      checkOutLng: actor.lng ?? null,
      solution: input.solution ?? wo.solution,
      diagnosis: input.diagnosis ?? wo.diagnosis,
      technicianNotes: input.technicianNotes ?? wo.technicianNotes,
      signatureUrl: input.signatureUrl ?? wo.signatureUrl,
      signedByName: input.signedByName ?? wo.signedByName,
      totalAmount: total,
    })
    .where(eq(workOrders.id, id))
    .returning();

  // Cobrança de serviço/materiais fora do contrato
  if (total > 0 && wo.receivableId) {
    await tx
      .update(receivables)
      .set({ amount: total })
      .where(and(eq(receivables.id, wo.receivableId), eq(receivables.status, "aberto")));
  }
  if (total > 0 && !wo.receivableId) {
    const settings = await getSettings(tx);
    const cat = await tx.query.financeCategories.findFirst({
      where: and(eq(financeCategories.name, "Serviços avulsos"), eq(financeCategories.type, "receita")),
    });
    const [rec] = await tx
      .insert(receivables)
      .values({
        customerId: wo.customerId,
        workOrderId: wo.id,
        categoryId: cat?.id ?? null,
        kind: "servico",
        description: `${formatOM(wo.number)} — ${wo.title}`,
        dueDate: addDays(todayISO(), settings.serviceDueDays),
        amount: total,
      })
      .returning();
    await tx.update(workOrders).set({ receivableId: rec.id }).where(eq(workOrders.id, id));
    updated.receivableId = rec.id;
  }

  await releaseEquipmentIfIdle(tx, wo.equipmentId, id);
  await logEvent(tx, id, { kind: "status", fromStatus: wo.status as WorkOrderStatus, toStatus: "concluida", message: "OM concluída.", actor });
  await createCommissionForWorkOrder(tx, id);
  await notifyCustomer(tx, wo.customerId, {
    title: "Atendimento concluído",
    body: `${formatOM(wo.number)} — ${wo.title}. Avalie o atendimento no portal.`,
    link: `/portal/atendimentos/${wo.id}`,
  });
  return updated;
}

/** Reabre uma OM concluída (estorna comissão não paga). */
export async function reopenWorkOrder(tx: DbLike, id: string, actor: Actor, reason: string) {
  const wo = await getWorkOrderOrThrow(tx, id);
  if (wo.status !== "concluida") throw new Error("Só OMs concluídas podem ser reabertas.");
  await tx.update(workOrders).set({ status: "em_execucao", finishedAt: null }).where(eq(workOrders.id, id));
  await cancelCommissionsForWorkOrder(tx, id);
  await logEvent(tx, id, { kind: "status", fromStatus: "concluida", toStatus: "em_execucao", message: `Reaberta: ${reason}`, actor });
}

export async function assignWorkOrder(
  tx: DbLike,
  id: string,
  { technicianId, scheduledDate, scheduledTime }: { technicianId: string | null; scheduledDate?: string | null; scheduledTime?: string | null },
  actor: Actor,
) {
  const wo = await getWorkOrderOrThrow(tx, id);
  if (["concluida", "cancelada", "em_execucao"].includes(wo.status)) {
    throw new Error("Não é possível reatribuir uma OM em execução, concluída ou cancelada.");
  }
  const date = scheduledDate === undefined ? wo.scheduledDate : scheduledDate;
  const nextStatus: WorkOrderStatus =
    wo.status === "aberta" || wo.status === "agendada"
      ? technicianId && date
        ? "agendada"
        : "aberta"
      : (wo.status as WorkOrderStatus);
  await tx
    .update(workOrders)
    .set({
      technicianId,
      scheduledDate: date,
      scheduledTime: scheduledTime === undefined ? wo.scheduledTime : scheduledTime,
      status: nextStatus,
    })
    .where(eq(workOrders.id, id));
  const changedTech = technicianId !== wo.technicianId;
  await logEvent(tx, id, {
    kind: changedTech ? "assigned" : "rescheduled",
    fromStatus: wo.status as WorkOrderStatus,
    toStatus: nextStatus,
    message: changedTech ? "Técnico atribuído." : "Reagendada.",
    actor,
  });
  if (technicianId && (changedTech || date !== wo.scheduledDate)) {
    await notifyTechnician(tx, technicianId, {
      title: changedTech ? `OM ${formatOM(wo.number)} atribuída a você` : `OM ${formatOM(wo.number)} reagendada`,
      body: wo.title,
      link: `/tecnico/om/${wo.id}`,
    });
  }
}

/** Lança material aplicado na OM e dá baixa no estoque do veículo do técnico (ou almoxarifado). */
export async function addWorkOrderMaterial(
  tx: DbLike,
  workOrderId: string,
  input: { productId: string; quantity: number; chargeCustomer?: boolean; unitPrice?: number; locationId?: string | null },
  actor: Actor,
) {
  if (input.quantity <= 0) throw new Error("Informe uma quantidade maior que zero.");
  const wo = await getWorkOrderOrThrow(tx, workOrderId);
  if (["concluida", "cancelada"].includes(wo.status)) throw new Error("A OM já foi encerrada.");
  const product = await tx.query.products.findFirst({ where: eq(products.id, input.productId) });
  if (!product) throw new Error("Produto não encontrado.");
  const location = input.locationId
    ? { id: input.locationId }
    : await defaultLocationFor(tx, wo.technicianId);

  const [m] = await tx
    .insert(workOrderMaterials)
    .values({
      workOrderId,
      productId: product.id,
      locationId: location.id,
      quantity: input.quantity,
      unitCost: product.costPrice,
      unitPrice: input.unitPrice ?? product.salePrice,
      chargeCustomer: input.chargeCustomer ?? false,
    })
    .returning();
  await moveStock(tx, {
    productId: product.id,
    locationId: location.id,
    type: "consumo_om",
    quantity: -input.quantity,
    unitCost: product.costPrice,
    workOrderId,
    userId: actor.userId,
    notes: formatOM(wo.number),
  });
  await logEvent(tx, workOrderId, { kind: "material", message: `${input.quantity} ${product.unit} de ${product.name}`, actor });
  await ensureReorderRequests(tx, { productIds: [product.id], userId: actor.userId });
  return m;
}

export async function removeWorkOrderMaterial(tx: DbLike, materialId: string, actor: Actor) {
  const m = await tx.query.workOrderMaterials.findFirst({ where: eq(workOrderMaterials.id, materialId) });
  if (!m) return;
  const wo = await getWorkOrderOrThrow(tx, m.workOrderId);
  if (["concluida", "cancelada"].includes(wo.status)) throw new Error("A OM já foi encerrada.");
  if (m.locationId) {
    await moveStock(tx, {
      productId: m.productId,
      locationId: m.locationId,
      type: "estorno_om",
      quantity: m.quantity,
      unitCost: m.unitCost,
      workOrderId: m.workOrderId,
      userId: actor.userId,
    });
  }
  await tx.delete(workOrderMaterials).where(eq(workOrderMaterials.id, materialId));
  await logEvent(tx, m.workOrderId, { kind: "material", message: "Material removido.", actor });
}

/** Devolve ao estoque os materiais de uma OM cancelada. */
async function reverseWorkOrderMaterials(tx: DbLike, workOrderId: string, actor: Actor) {
  const mats = await tx.query.workOrderMaterials.findMany({ where: eq(workOrderMaterials.workOrderId, workOrderId) });
  for (const m of mats) {
    if (!m.locationId) continue;
    await moveStock(tx, {
      productId: m.productId,
      locationId: m.locationId,
      type: "estorno_om",
      quantity: m.quantity,
      unitCost: m.unitCost,
      workOrderId,
      userId: actor.userId,
      notes: "OM cancelada",
    });
  }
}

export async function setTaskDone(
  tx: DbLike,
  taskId: string,
  input: { done: boolean; measurementValue?: string | null; notes?: string | null },
) {
  const t = await tx.query.workOrderTasks.findFirst({ where: eq(workOrderTasks.id, taskId) });
  if (!t) throw new Error("Item do checklist não encontrado.");
  const wo = await getWorkOrderOrThrow(tx, t.workOrderId);
  if (!["em_execucao", "pausada"].includes(wo.status)) {
    throw new Error("Inicie o atendimento para preencher o checklist.");
  }
  await tx
    .update(workOrderTasks)
    .set({
      done: input.done,
      doneAt: input.done ? new Date() : null,
      measurementValue: input.measurementValue === undefined ? t.measurementValue : input.measurementValue,
      notes: input.notes === undefined ? t.notes : input.notes,
    })
    .where(eq(workOrderTasks.id, taskId));
  return { workOrderId: t.workOrderId };
}

/** Contagem de OMs por status (painéis). */
export async function countByStatus(tx: DbLike, where?: ReturnType<typeof and>) {
  const rows = await tx
    .select({ status: workOrders.status, n: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(where)
    .groupBy(workOrders.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}
