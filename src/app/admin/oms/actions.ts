"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  customerSites,
  customers,
  equipment,
  maintenancePlans,
  stockLevels,
  stockLocations,
  technicians,
  workOrderMaterials,
  workOrderPhotos,
  workOrderTasks,
  workOrders,
} from "@/db/schema";
import { type ActionState, formValues, runAction, zodFieldErrors } from "@/lib/action";
import { assertRole, type AppUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import { MAX_UPLOAD_BYTES, storeFile } from "@/lib/storage";
import type { WorkOrderStatus } from "@/server/core/work-order-flow";
import {
  addWorkOrderMaterial,
  assignWorkOrder,
  changeWorkOrderStatus,
  completeWorkOrder,
  createWorkOrder,
  getWorkOrderOrThrow,
  logEvent,
  removeWorkOrderMaterial,
  reopenWorkOrder,
  setTaskDone,
  type Actor,
} from "@/server/work-orders";
import { isISODate, isUuid } from "./_lib/constants";

const STAFF = ["admin", "gestor"] as const;

const actor = (u: AppUser): Actor => ({ userId: u.id });

function revalidateOm(id?: string) {
  revalidatePath("/admin/oms");
  if (id) revalidatePath(`/admin/oms/${id}`);
  revalidatePath("/admin/agenda");
  revalidatePath("/admin");
}

const uuid = z.string().uuid("Registro inválido.");
const optionalUuid = z.string().uuid("Registro inválido.").nullable();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.")
  .nullable();
const optionalTime = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Informe um horário válido (hh:mm).")
  .nullable();

/* ------------------------------------------------------------------ */
/* Criar OM                                                            */
/* ------------------------------------------------------------------ */

const createSchema = z
  .object({
    type: z.enum(["preventiva", "corretiva", "instalacao", "visita_tecnica", "pmoc"], {
      message: "Escolha o tipo da OM.",
    }),
    priority: z.enum(["baixa", "normal", "alta", "urgente"], { message: "Escolha a prioridade." }),
    customerId: z.string({ message: "Escolha o cliente." }).uuid("Escolha o cliente."),
    siteId: optionalUuid,
    equipmentId: optionalUuid,
    maintenancePlanId: optionalUuid,
    title: z.string({ message: "Dê um título para a OM." }).min(3, "Dê um título com pelo menos 3 letras.").max(160),
    description: z.string().max(4000).nullable(),
    technicianId: optionalUuid,
    scheduledDate: optionalDate,
    scheduledTime: optionalTime,
    laborAmount: z.number().min(0, "O valor não pode ser negativo.").nullable(),
    billable: z.boolean(),
  })
  .refine((v) => !v.scheduledTime || v.scheduledDate, {
    path: ["scheduledDate"],
    message: "Informe a data para usar um horário.",
  });

export async function createOmAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    const v = formValues(fd);
    const parsed = createSchema.safeParse({
      type: v.str("type"),
      priority: v.str("priority") ?? "normal",
      customerId: v.str("customerId") ?? undefined,
      siteId: v.str("siteId"),
      equipmentId: v.str("equipmentId"),
      maintenancePlanId: v.str("maintenancePlanId"),
      title: v.str("title") ?? undefined,
      description: v.str("description"),
      technicianId: v.str("technicianId"),
      scheduledDate: v.str("scheduledDate"),
      scheduledTime: v.str("scheduledTime"),
      laborAmount: v.money("laborAmount"),
      billable: v.bool("billable"),
    });
    if (!parsed.success) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    const d = parsed.data;

    // Confere que local, equipamento, plano e técnico existem e pertencem ao cliente.
    const customer = await db.query.customers.findFirst({ where: eq(customers.id, d.customerId), columns: { id: true } });
    if (!customer) return { ok: false, fieldErrors: { customerId: "Cliente não encontrado." }, error: "Cliente não encontrado." };
    if (d.siteId) {
      const site = await db.query.customerSites.findFirst({
        where: and(eq(customerSites.id, d.siteId), eq(customerSites.customerId, d.customerId)),
        columns: { id: true },
      });
      if (!site) return { ok: false, fieldErrors: { siteId: "Este local não é do cliente escolhido." }, error: "Revise o local." };
    }
    let siteId = d.siteId;
    if (d.equipmentId) {
      const eqp = await db.query.equipment.findFirst({
        where: and(eq(equipment.id, d.equipmentId), eq(equipment.customerId, d.customerId)),
        columns: { id: true, siteId: true },
      });
      if (!eqp)
        return { ok: false, fieldErrors: { equipmentId: "Este equipamento não é do cliente escolhido." }, error: "Revise o equipamento." };
      siteId = siteId ?? eqp.siteId;
    }
    if (d.maintenancePlanId) {
      const plan = await db.query.maintenancePlans.findFirst({ where: eq(maintenancePlans.id, d.maintenancePlanId), columns: { id: true } });
      if (!plan) return { ok: false, fieldErrors: { maintenancePlanId: "Plano não encontrado." }, error: "Revise o plano." };
    }
    if (d.technicianId) {
      const tech = await db.query.technicians.findFirst({
        where: and(eq(technicians.id, d.technicianId), eq(technicians.active, true)),
        columns: { id: true },
      });
      if (!tech) return { ok: false, fieldErrors: { technicianId: "Técnico inativo ou não encontrado." }, error: "Revise o técnico." };
    }

    const wo = await db.transaction((tx) =>
      createWorkOrder(
        tx,
        {
          type: d.type,
          origin: "manual",
          priority: d.priority,
          customerId: d.customerId,
          siteId,
          equipmentId: d.equipmentId,
          maintenancePlanId: d.maintenancePlanId,
          technicianId: d.technicianId,
          scheduledDate: d.scheduledDate,
          scheduledTime: d.scheduledTime,
          title: d.title,
          description: d.description,
          laborAmount: d.laborAmount ?? undefined,
          billable: d.billable,
        },
        actor(user),
      ),
    );
    if (!wo) return { ok: false, error: "Não foi possível criar a OM. Tente novamente." };
    revalidateOm(wo.id);
    revalidatePath(`/admin/clientes/${d.customerId}`);
    redirect(`/admin/oms/${wo.id}?criada=1`);
  });
}

/** Locais e equipamentos do cliente para o formulário de nova OM. */
export async function customerContextAction(customerId: string) {
  await assertRole([...STAFF]);
  if (!isUuid(customerId)) return { sites: [], equipment: [], defaultTechnicianId: null as string | null };
  const [c, sites, eqs] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, customerId), columns: { defaultTechnicianId: true } }),
    db.query.customerSites.findMany({
      where: eq(customerSites.customerId, customerId),
      columns: { id: true, name: true, street: true, number: true, district: true, city: true, state: true, isPrimary: true },
      orderBy: (s, { desc, asc }) => [desc(s.isPrimary), asc(s.name)],
    }),
    db.query.equipment.findMany({
      where: eq(equipment.customerId, customerId),
      columns: { id: true, code: true, siteId: true, brand: true, model: true, location: true, typeId: true, status: true },
      with: { type: { columns: { name: true } } },
      orderBy: (e, { asc }) => [asc(e.code)],
    }),
  ]);
  return {
    sites,
    equipment: eqs
      .filter((e) => e.status !== "removido")
      .map((e) => ({
        id: e.id,
        code: e.code,
        siteId: e.siteId,
        typeId: e.typeId,
        typeName: e.type?.name ?? null,
        brand: e.brand,
        model: e.model,
        location: e.location,
      })),
    defaultTechnicianId: c?.defaultTechnicianId ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Atribuir / reagendar                                                */
/* ------------------------------------------------------------------ */

const assignSchema = z.object({
  technicianId: optionalUuid,
  scheduledDate: optionalDate,
  scheduledTime: optionalTime,
});

async function ensureTechnician(technicianId: string | null) {
  if (!technicianId) return;
  const t = await db.query.technicians.findFirst({
    where: and(eq(technicians.id, technicianId), eq(technicians.active, true)),
    columns: { id: true },
  });
  if (!t) throw new Error("Técnico inativo ou não encontrado. Escolha outro técnico.");
}

export async function assignOmAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "OM não encontrada." };
    const v = formValues(fd);
    const parsed = assignSchema.safeParse({
      technicianId: v.str("technicianId"),
      scheduledDate: v.str("scheduledDate"),
      scheduledTime: v.str("scheduledTime"),
    });
    if (!parsed.success) return { ok: false, error: "Revise os campos.", fieldErrors: zodFieldErrors(parsed.error) };
    const d = parsed.data;
    if (d.scheduledTime && !d.scheduledDate) {
      return { ok: false, error: "Informe a data para usar um horário.", fieldErrors: { scheduledDate: "Informe a data." } };
    }
    await ensureTechnician(d.technicianId);
    const before = await db.transaction(async (tx) => {
      const current = await getWorkOrderOrThrow(tx, id);
      await assignWorkOrder(
        tx,
        id,
        { technicianId: d.technicianId, scheduledDate: d.scheduledDate, scheduledTime: d.scheduledTime },
        actor(user),
      );
      return current;
    });
    revalidateOm(id);
    const message = !d.technicianId
      ? "Técnico removido. A OM voltou para a fila de despacho"
      : before.technicianId !== d.technicianId
        ? "Técnico atribuído"
        : "OM reagendada";
    return { ok: true, message };
  });
}

/** Atribuição em lote (lista de OMs): técnico + data para cada OM selecionada, numa transação. */
export async function bulkAssignAction(input: {
  ids: string[];
  technicianId: string;
  scheduledDate: string;
  scheduledTime?: string | null;
}): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    const ids = [...new Set(input.ids)].filter(isUuid);
    if (!ids.length) return { ok: false, error: "Selecione pelo menos uma OM." };
    if (ids.length > 200) return { ok: false, error: "Selecione no máximo 200 OMs por vez." };
    if (!isUuid(input.technicianId)) return { ok: false, error: "Escolha o técnico." };
    if (!isISODate(input.scheduledDate)) return { ok: false, error: "Escolha a data do atendimento." };
    const time = input.scheduledTime && /^\d{2}:\d{2}$/.test(input.scheduledTime) ? input.scheduledTime : undefined;
    await ensureTechnician(input.technicianId);
    await db.transaction(async (tx) => {
      for (const id of ids) {
        await assignWorkOrder(
          tx,
          id,
          { technicianId: input.technicianId, scheduledDate: input.scheduledDate, scheduledTime: time },
          actor(user),
        );
      }
    });
    revalidateOm();
    return { ok: true, message: ids.length === 1 ? "Técnico atribuído à OM" : `Técnico atribuído a ${ids.length} OMs` };
  });
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

const STATUS_MESSAGES: Partial<Record<WorkOrderStatus, string>> = {
  aberta: "OM aberta novamente",
  agendada: "OM marcada como agendada",
  em_deslocamento: "OM marcada a caminho",
  em_execucao: "Atendimento iniciado",
  pausada: "Atendimento pausado",
  aguardando_material: "OM aguardando material",
  cancelada: "OM cancelada",
};

export async function changeStatusAction(id: string, to: WorkOrderStatus): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "OM não encontrada." };
    if (to === "cancelada") return { ok: false, error: "Informe o motivo para cancelar a OM." };
    await db.transaction((tx) => changeWorkOrderStatus(tx, id, to, actor(user), "Alterado pela central."));
    revalidateOm(id);
    const msg = to === "em_execucao" ? "Atendimento em execução" : STATUS_MESSAGES[to];
    return { ok: true, message: msg ?? "Status alterado" };
  });
}

const reasonSchema = z
  .string({ message: "Informe o motivo." })
  .trim()
  .min(5, "Descreva o motivo com pelo menos 5 letras.")
  .max(500);

export async function cancelOmAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "OM não encontrada." };
    const reason = reasonSchema.safeParse(formValues(fd).str("reason") ?? undefined);
    if (!reason.success) return { ok: false, error: "Informe o motivo do cancelamento.", fieldErrors: { reason: reason.error.issues[0].message } };
    await db.transaction(async (tx) => {
      const wo = await changeWorkOrderStatus(tx, id, "cancelada", actor(user), `Cancelada: ${reason.data}`);
      // O serviço marca o equipamento "em manutenção" ao iniciar; ao cancelar, devolve para "ativo"
      // quando não houver outro atendimento em andamento nele.
      if (wo.equipmentId) {
        const other = await tx.query.workOrders.findFirst({
          where: and(
            eq(workOrders.equipmentId, wo.equipmentId),
            inArray(workOrders.status, ["em_execucao", "pausada"]),
            ne(workOrders.id, id),
          ),
          columns: { id: true },
        });
        if (!other) {
          await tx
            .update(equipment)
            .set({ status: "ativo" })
            .where(and(eq(equipment.id, wo.equipmentId), eq(equipment.status, "em_manutencao")));
        }
      }
    });
    revalidateOm(id);
    return { ok: true, message: "OM cancelada. Os materiais lançados voltaram ao estoque." };
  });
}

export async function reopenOmAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "OM não encontrada." };
    const reason = reasonSchema.safeParse(formValues(fd).str("reason") ?? undefined);
    if (!reason.success) return { ok: false, error: "Informe o motivo da reabertura.", fieldErrors: { reason: reason.error.issues[0].message } };
    await db.transaction((tx) => reopenWorkOrder(tx, id, actor(user), reason.data));
    revalidateOm(id);
    return { ok: true, message: "OM reaberta e de volta à execução" };
  });
}

export async function completeOmAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "OM não encontrada." };
    const wo = await db.transaction((tx) => completeWorkOrder(tx, id, {}, actor(user)));
    revalidateOm(id);
    revalidatePath("/admin/financeiro/receber");
    revalidatePath("/admin/comissoes");
    return {
      ok: true,
      message: wo.receivableId ? "OM concluída. A cobrança do serviço foi gerada." : "OM concluída",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */

export async function saveTaskAction(input: {
  taskId: string;
  done: boolean;
  measurementValue?: string | null;
  notes?: string | null;
}): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    if (!isUuid(input.taskId)) return { ok: false, error: "Item do checklist não encontrado." };
    const measurement = input.measurementValue === undefined ? undefined : input.measurementValue?.trim().slice(0, 60) || null;
    const notes = input.notes === undefined ? undefined : input.notes?.trim().slice(0, 1000) || null;
    if (input.done) {
      const t = await db.query.workOrderTasks.findFirst({ where: eq(workOrderTasks.id, input.taskId) });
      const value = measurement === undefined ? t?.measurementValue : measurement;
      if (t?.measurementUnit && !value?.trim()) {
        return { ok: false, error: `Registre a medição (${t.measurementUnit}) antes de marcar "${t.title}".` };
      }
    }
    const { workOrderId } = await db.transaction((tx) =>
      setTaskDone(tx, input.taskId, { done: input.done, measurementValue: measurement, notes }),
    );
    revalidatePath(`/admin/oms/${workOrderId}`);
    return { ok: true, message: input.done ? "Item concluído" : "Item salvo" };
  });
}

/* ------------------------------------------------------------------ */
/* Materiais                                                           */
/* ------------------------------------------------------------------ */

export type MaterialState = ActionState & { warning?: string };

const materialSchema = z.object({
  productId: uuid,
  locationId: optionalUuid,
  quantity: z.number({ message: "Informe a quantidade." }).positive("Informe uma quantidade maior que zero.").max(100000),
  chargeCustomer: z.boolean(),
  unitPrice: z.number().min(0, "O preço não pode ser negativo.").nullable(),
});

export async function addMaterialAction(id: string, _prev: MaterialState, fd: FormData): Promise<MaterialState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "OM não encontrada." };
    const v = formValues(fd);
    const parsed = materialSchema.safeParse({
      productId: v.str("productId") ?? "",
      locationId: v.str("locationId"),
      quantity: v.num("quantity") ?? undefined,
      chargeCustomer: v.bool("chargeCustomer"),
      unitPrice: v.money("unitPrice"),
    });
    if (!parsed.success) {
      const fe = zodFieldErrors(parsed.error);
      if (fe.productId) fe.productId = "Escolha o produto.";
      return { ok: false, error: "Revise os campos do material.", fieldErrors: fe };
    }
    const d = parsed.data;
    if (d.locationId) {
      const loc = await db.query.stockLocations.findFirst({
        where: and(eq(stockLocations.id, d.locationId), eq(stockLocations.active, true)),
        columns: { id: true },
      });
      if (!loc) return { ok: false, error: "Local de estoque inválido.", fieldErrors: { locationId: "Escolha outro local." } };
    }
    const result = await db.transaction(async (tx) => {
      const m = await addWorkOrderMaterial(
        tx,
        id,
        {
          productId: d.productId,
          quantity: d.quantity,
          chargeCustomer: d.chargeCustomer,
          unitPrice: d.unitPrice ?? undefined,
          locationId: d.locationId,
        },
        actor(user),
      );
      const level = m.locationId
        ? await tx.query.stockLevels.findFirst({
            where: and(eq(stockLevels.productId, m.productId), eq(stockLevels.locationId, m.locationId)),
            with: { location: { columns: { name: true } }, product: { columns: { unit: true, name: true } } },
          })
        : null;
      return { m, level };
    });
    revalidateOm(id);
    revalidatePath("/admin/estoque");
    const lv = result.level;
    if (lv && lv.quantity < 0) {
      return {
        ok: true,
        message: "Material lançado",
        warning: `O saldo de ${lv.product.name} em ${lv.location.name} ficou negativo (${formatNumber(lv.quantity)} ${lv.product.unit}). Registre a entrada ou a transferência no estoque.`,
      };
    }
    return { ok: true, message: "Material lançado" };
  });
}

export async function removeMaterialAction(materialId: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(materialId)) return { ok: false, error: "Material não encontrado." };
    const m = await db.query.workOrderMaterials.findFirst({ where: eq(workOrderMaterials.id, materialId), columns: { workOrderId: true } });
    if (!m) return { ok: false, error: "Este material já foi removido." };
    await db.transaction((tx) => removeWorkOrderMaterial(tx, materialId, actor(user)));
    revalidateOm(m.workOrderId);
    revalidatePath("/admin/estoque");
    return { ok: true, message: "Material removido e devolvido ao estoque" };
  });
}

/* ------------------------------------------------------------------ */
/* Fotos                                                               */
/* ------------------------------------------------------------------ */

const PHOTO_KIND = z.enum(["antes", "depois", "problema", "outro"]);

export async function uploadPhotosAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (): Promise<ActionState> => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "OM não encontrada." };
    await getWorkOrderOrThrow(db, id);
    const kind = PHOTO_KIND.safeParse(fd.get("kind"));
    if (!kind.success) return { ok: false, error: "Escolha o tipo da foto.", fieldErrors: { kind: "Escolha o tipo." } };
    const caption = formValues(fd).str("caption")?.slice(0, 200) ?? null;
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return { ok: false, error: "Escolha pelo menos uma foto.", fieldErrors: { files: "Escolha uma foto." } };
    if (files.length > 10) return { ok: false, error: "Envie no máximo 10 fotos por vez." };
    for (const f of files) {
      if (!f.type.startsWith("image/")) return { ok: false, error: `"${f.name}" não é uma imagem. Envie JPG, PNG ou WEBP.` };
      if (f.size > MAX_UPLOAD_BYTES) return { ok: false, error: `"${f.name}" passa de 8 MB. Reduza a foto e tente de novo.` };
    }
    const urls: string[] = [];
    for (const f of files) urls.push(await storeFile("om", f, f.name));
    await db.transaction(async (tx) => {
      await tx.insert(workOrderPhotos).values(
        urls.map((url) => ({ workOrderId: id, url, kind: kind.data, caption, takenById: user.id })),
      );
      await logEvent(tx, id, {
        kind: "photo",
        message: urls.length === 1 ? "1 foto enviada pela central." : `${urls.length} fotos enviadas pela central.`,
        actor: actor(user),
      });
    });
    revalidatePath(`/admin/oms/${id}`);
    return { ok: true, message: urls.length === 1 ? "Foto enviada" : `${urls.length} fotos enviadas` };
  });
}

export async function removePhotoAction(photoId: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    if (!isUuid(photoId)) return { ok: false, error: "Foto não encontrada." };
    const [p] = await db.delete(workOrderPhotos).where(eq(workOrderPhotos.id, photoId)).returning({ workOrderId: workOrderPhotos.workOrderId });
    if (p) revalidatePath(`/admin/oms/${p.workOrderId}`);
    return { ok: true, message: "Foto removida" };
  });
}

/* ------------------------------------------------------------------ */
/* Textos técnicos e valores                                           */
/* ------------------------------------------------------------------ */

const notesSchema = z.object({
  description: z.string().max(4000).nullable(),
  diagnosis: z.string().max(4000).nullable(),
  solution: z.string().max(4000).nullable(),
  technicianNotes: z.string().max(4000).nullable(),
});

export async function saveNotesAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "OM não encontrada." };
    const v = formValues(fd);
    const parsed = notesSchema.safeParse({
      description: v.str("description"),
      diagnosis: v.str("diagnosis"),
      solution: v.str("solution"),
      technicianNotes: v.str("technicianNotes"),
    });
    if (!parsed.success) return { ok: false, error: "Os textos estão longos demais (máximo de 4.000 caracteres).", fieldErrors: zodFieldErrors(parsed.error) };
    await db.transaction(async (tx) => {
      await getWorkOrderOrThrow(tx, id);
      await tx.update(workOrders).set(parsed.data).where(eq(workOrders.id, id));
      await logEvent(tx, id, { kind: "note", message: "Descrição, diagnóstico e solução atualizados pela central.", actor: actor(user) });
    });
    revalidatePath(`/admin/oms/${id}`);
    return { ok: true, message: "Anotações salvas" };
  });
}

const billingSchema = z.object({
  laborAmount: z.number({ message: "Informe o valor da mão de obra." }).min(0, "O valor não pode ser negativo.").max(1_000_000),
  billable: z.boolean(),
});

export async function saveBillingAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    if (!isUuid(id)) return { ok: false, error: "OM não encontrada." };
    const v = formValues(fd);
    const parsed = billingSchema.safeParse({ laborAmount: v.money("laborAmount") ?? 0, billable: v.bool("billable") });
    if (!parsed.success) return { ok: false, error: "Revise o valor.", fieldErrors: zodFieldErrors(parsed.error) };
    await db.transaction(async (tx) => {
      const wo = await getWorkOrderOrThrow(tx, id);
      if (wo.status === "concluida" || wo.status === "cancelada") {
        throw new Error("A OM já foi encerrada. Reabra a OM para alterar os valores.");
      }
      await tx.update(workOrders).set(parsed.data).where(eq(workOrders.id, id));
      await logEvent(tx, id, {
        kind: "note",
        message: `Mão de obra ajustada para R$ ${parsed.data.laborAmount.toFixed(2).replace(".", ",")}${parsed.data.billable ? ", com cobrança ao concluir." : ", sem cobrança avulsa."}`,
        actor: actor(user),
      });
    });
    revalidatePath(`/admin/oms/${id}`);
    return { ok: true, message: "Valores salvos" };
  });
}
