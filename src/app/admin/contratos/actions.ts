"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, type Tx } from "@/db";
import {
  contractEquipment,
  contracts,
  customers,
  equipment,
  maintenancePlans,
  maintenancePlanTasks,
  technicians,
  workOrders,
} from "@/db/schema";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { todayISO, type ISODate } from "@/lib/dates";
import { formatContractCode, formatDate, formatEquipmentCode, formatOM } from "@/lib/format";
import { generateInvoices } from "@/server/billing";
import { visitIntervalMonths } from "@/server/core/schedule";
import { generateWorkOrders } from "@/server/scheduler";
import { assignWorkOrder, changeWorkOrderStatus } from "@/server/work-orders";
import { isPlannedVisit, resumeScheduleAfter, type ScheduleItem } from "./_lib/forecast";
import {
  customerEquipmentWithCoverage,
  isUuid,
  lastAutoDueByEquipment,
  lastAutoDueDate,
  openAutoWorkOrders,
  type CoverageEquipment,
} from "./_lib/queries";

const STAFF = ["admin", "gestor"] as const;
const isoDate = z.string("Informe a data.").regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function isUniqueViolation(e: unknown, constraint: string) {
  const err = e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const c = err?.cause ?? err;
  return c?.code === "23505" && (!constraint || c?.constraint_name === constraint);
}

/** Junta frases do toast (sem ponto final, como os demais toasts). */
function sentences(...parts: (string | false | null | undefined)[]) {
  return parts
    .filter((p): p is string => !!p)
    .map((p) => p.replace(/\.$/, ""))
    .join(". ");
}

type OpenWorkOrder = Awaited<ReturnType<typeof openAutoWorkOrders>>[number];
type CancelResult = { cancelled: OpenWorkOrder[]; failed: { number: number; message: string }[] };

/**
 * Cancela as OMs uma a uma, cada uma num savepoint: a que a regra não deixa cancelar (comissão em
 * fechamento, serviço já pago…) continua ativa e é informada, sem desfazer o resto da operação.
 */
async function cancelEach(tx: Tx, rows: OpenWorkOrder[], userId: string, note: (wo: OpenWorkOrder) => string): Promise<CancelResult> {
  const result: CancelResult = { cancelled: [], failed: [] };
  for (const wo of rows) {
    try {
      await tx.transaction((sp) => changeWorkOrderStatus(sp, wo.id, "cancelada", { userId }, note(wo)));
      result.cancelled.push(wo);
    } catch (e) {
      result.failed.push({ number: wo.number, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

function cancelledText(cancelled: OpenWorkOrder[], today: ISODate) {
  const late = cancelled.filter((wo) => (wo.scheduledDate ?? wo.dueDate ?? today) < today).length;
  return `${count(cancelled.length, "OM cancelada", "OMs canceladas")}${late ? ` (${late} ${late === 1 ? "atrasada" : "atrasadas"})` : ""}`;
}

function failedText(failed: CancelResult["failed"]) {
  if (!failed.length) return null;
  const list = failed.map((f) => formatOM(f.number)).join(", ");
  return `${list} ${failed.length === 1 ? "ficou ativa" : "ficaram ativas"}: ${failed[0].message}`;
}

/**
 * Equipamento que volta a um contrato (ou muda de contrato): a agenda nova retoma depois da última
 * visita dele, para o gerador não recriar o mesmo ciclo. Devolve o `lastGeneratedDueDate` de cada item.
 */
async function resumeDatesFor(items: { equipmentId: string; maintenancePlanId: string; anchorDate: ISODate }[]) {
  const last = await lastAutoDueByEquipment(items.map((i) => i.equipmentId));
  if (!last.size) return items.map(() => null);
  const tasks = await db.query.maintenancePlanTasks.findMany({
    where: inArray(maintenancePlanTasks.planId, [...new Set(items.map((i) => i.maintenancePlanId))]),
    columns: { planId: true, frequencyMonths: true },
  });
  return items.map((i) => {
    const l = last.get(i.equipmentId) ?? null;
    return l ? resumeScheduleAfter(l, i.anchorDate, visitIntervalMonths(tasks.filter((t) => t.planId === i.maintenancePlanId))) : null;
  });
}

function revalidateContract(contractId: string, customerId: string) {
  revalidatePath("/admin/contratos");
  revalidatePath(`/admin/contratos/${contractId}`);
  revalidatePath(`/admin/clientes/${customerId}`);
  revalidatePath("/admin/planos");
  revalidatePath("/admin/oms");
  revalidatePath("/admin");
}

/* ------------------------------------------------------------------ criar */

/** Equipamentos do cliente escolhido no formulário de novo contrato (com a cobertura atual). */
export async function loadCustomerEquipment(
  customerId: string,
): Promise<{ ok: true; equipment: CoverageEquipment[] } | { ok: false; error: string }> {
  try {
    await assertRole([...STAFF]);
    if (!isUuid(customerId)) return { ok: false, error: "Cliente inválido." };
    return { ok: true, equipment: await customerEquipmentWithCoverage(customerId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível carregar os equipamentos." };
  }
}

const itemSchema = z.object({
  equipmentId: z.guid("Equipamento inválido."),
  maintenancePlanId: z.guid("Escolha o plano de manutenção."),
  anchorDate: isoDate,
  preferredTechnicianId: z.guid().nullable(),
});

const contractFields = {
  name: z.string().trim().min(3, "Dê um nome ao contrato (ex.: Plano Neve — 3 aparelhos).").max(120, "Nome muito longo."),
  monthlyAmount: z.number("Informe o valor da mensalidade.").positive("A mensalidade deve ser maior que zero.").max(1_000_000, "Valor muito alto."),
  billingDay: z
    .number("Informe o dia de vencimento.")
    .int("Use um dia inteiro.")
    .min(1, "O dia de vencimento vai de 1 a 28.")
    .max(28, "O dia de vencimento vai de 1 a 28 (evita meses sem dia 29, 30 ou 31)."),
  endDate: isoDate.nullable(),
  notes: z
    .string()
    .trim()
    .max(2000, "Observações muito longas.")
    .nullable()
    .transform((v) => v || null),
};

const createSchema = z
  .object({
    customerId: z.guid("Escolha o cliente."),
    startDate: isoDate,
    ...contractFields,
    items: z.array(itemSchema).min(1, "Selecione pelo menos um equipamento para o contrato cobrir."),
  })
  .refine((d) => !d.endDate || d.endDate > d.startDate, { path: ["endDate"], message: "O término precisa ser depois do início." })
  .refine((d) => new Set(d.items.map((i) => i.equipmentId)).size === d.items.length, {
    path: ["items"],
    message: "Há equipamento repetido na lista.",
  });

export type CreateContractState = ActionState;

export async function createContract(fd: FormData): Promise<CreateContractState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const v = formValues(fd);
    let items: unknown = [];
    try {
      items = JSON.parse(String(fd.get("items") ?? "[]"));
    } catch {
      items = [];
    }
    const parsed = createSchema.safeParse({
      customerId: v.str("customerId") ?? "",
      name: v.str("name") ?? "",
      monthlyAmount: v.money("monthlyAmount") ?? undefined,
      billingDay: v.num("billingDay") ?? undefined,
      startDate: v.str("startDate") ?? undefined,
      endDate: v.str("endDate"),
      notes: v.str("notes"),
      items,
    });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const data = parsed.data;

    const customer = await db.query.customers.findFirst({ where: eq(customers.id, data.customerId) });
    if (!customer) return { ok: false, error: "Cliente não encontrado." };
    if (customer.status !== "ativo") return { ok: false, error: "Este cliente está inativo. Reative o cadastro antes de criar um contrato." };

    const eqIds = data.items.map((i) => i.equipmentId);
    const eqRows = await db.query.equipment.findMany({
      where: inArray(equipment.id, eqIds),
      columns: { id: true, code: true, customerId: true, status: true },
    });
    const byId = new Map(eqRows.map((e) => [e.id, e]));
    for (const id of eqIds) {
      const e = byId.get(id);
      if (!e || e.customerId !== customer.id) return { ok: false, error: "Um dos equipamentos não pertence a este cliente. Recarregue a página." };
      if (e.status === "removido") return { ok: false, error: `${formatEquipmentCode(e.code)} está marcado como removido e não pode entrar em contrato.` };
    }
    const covered = await db.query.contractEquipment.findMany({
      where: and(inArray(contractEquipment.equipmentId, eqIds), eq(contractEquipment.active, true)),
      with: { contract: { columns: { code: true } }, equipment: { columns: { code: true } } },
    });
    if (covered.length) {
      const c = covered[0];
      return {
        ok: false,
        error: `${formatEquipmentCode(c.equipment.code)} já está coberto pelo contrato ${formatContractCode(c.contract.code)}. Um equipamento só pode estar em um contrato ativo.`,
      };
    }
    await assertPlansAndTechs(
      data.items.map((i) => i.maintenancePlanId),
      data.items.map((i) => i.preferredTechnicianId).filter((t): t is string => !!t),
    );

    const resume = await resumeDatesFor(data.items);
    let created: { id: string; itemIds: string[] };
    try {
      created = await db.transaction(async (tx) => {
        const [c] = await tx
          .insert(contracts)
          .values({
            customerId: customer.id,
            name: data.name,
            monthlyAmount: data.monthlyAmount,
            billingDay: data.billingDay,
            startDate: data.startDate,
            endDate: data.endDate,
            notes: data.notes,
            status: "ativo",
          })
          .returning({ id: contracts.id });
        const rows = await tx
          .insert(contractEquipment)
          .values(
            data.items.map((i, idx) => ({
              contractId: c.id,
              equipmentId: i.equipmentId,
              maintenancePlanId: i.maintenancePlanId,
              anchorDate: i.anchorDate,
              preferredTechnicianId: i.preferredTechnicianId,
              lastGeneratedDueDate: resume[idx],
            })),
          )
          .returning({ id: contractEquipment.id });
        return { id: c.id, itemIds: rows.map((r) => r.id) };
      });
    } catch (e) {
      if (isUniqueViolation(e, "contract_equipment_active_uq"))
        return { ok: false, error: "Um dos equipamentos acabou de entrar em outro contrato. Recarregue a página e confira a lista." };
      throw e;
    }

    // Fora da transação: o efeito aparece na hora (mesma rotina do cron diário).
    const invoices = await generateInvoices({ contractIds: [created.id] });
    const wos = await generateWorkOrders({ contractEquipmentIds: created.itemIds });
    revalidateContract(created.id, customer.id);
    revalidatePath("/admin/financeiro/receber");
    return {
      ok: true,
      id: created.id,
      message: `Contrato criado: ${count(wos.created, "OM", "OMs")} e ${count(invoices.created, "mensalidade", "mensalidades")} ${
        wos.created + invoices.created === 1 ? "gerada" : "geradas"
      }`,
    };
  });
}

async function assertPlansAndTechs(planIds: string[], techIds: string[]) {
  const uniquePlans = [...new Set(planIds)];
  if (uniquePlans.length) {
    const plans = await db.query.maintenancePlans.findMany({
      where: inArray(maintenancePlans.id, uniquePlans),
      columns: { id: true, name: true, active: true },
    });
    if (plans.length !== uniquePlans.length) throw new Error("Um dos planos de manutenção não existe mais. Escolha outro.");
    const inactive = plans.find((p) => !p.active);
    if (inactive) throw new Error(`O plano "${inactive.name}" está inativo. Escolha um plano ativo.`);
  }
  const uniqueTechs = [...new Set(techIds)];
  if (uniqueTechs.length) {
    const techs = await db.query.technicians.findMany({
      where: inArray(technicians.id, uniqueTechs),
      columns: { id: true, active: true, name: true },
    });
    if (techs.length !== uniqueTechs.length) throw new Error("Um dos técnicos escolhidos não existe mais.");
    const off = techs.find((t) => !t.active);
    if (off) throw new Error(`${off.name} está inativo. Escolha outro técnico.`);
  }
}

async function loadContract(id: string) {
  const c = await db.query.contracts.findFirst({ where: eq(contracts.id, id) });
  if (!c) throw new Error("Contrato não encontrado.");
  return c;
}

/* ------------------------------------------------------------ editar dados */

const updateSchema = z
  .object({ ...contractFields, startDate: isoDate })
  .refine((d) => !d.endDate || d.endDate > d.startDate, { path: ["endDate"], message: "O término precisa ser depois do início." });

export async function updateContract(contractId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const c = await loadContract(contractId);
    const v = formValues(fd);
    const parsed = updateSchema.safeParse({
      name: v.str("name") ?? "",
      monthlyAmount: v.money("monthlyAmount") ?? undefined,
      billingDay: v.num("billingDay") ?? undefined,
      endDate: v.str("endDate"),
      notes: v.str("notes"),
      startDate: c.startDate,
    });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const d = parsed.data;
    await db
      .update(contracts)
      .set({ name: d.name, monthlyAmount: d.monthlyAmount, billingDay: d.billingDay, endDate: d.endDate, notes: d.notes })
      .where(eq(contracts.id, contractId));
    revalidateContract(contractId, c.customerId);
    return { ok: true, message: "Contrato salvo" };
  });
}

/* ------------------------------------------------------------- situação */

export async function suspendContract(contractId: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const c = await loadContract(contractId);
    if (c.status !== "ativo") return { ok: false, error: "Só é possível suspender um contrato ativo." };
    await db.update(contracts).set({ status: "suspenso" }).where(eq(contracts.id, contractId));
    revalidateContract(contractId, c.customerId);
    return { ok: true, message: "Contrato suspenso: nenhuma OM ou mensalidade nova até reativar" };
  });
}

export async function reactivateContract(contractId: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const c = await loadContract(contractId);
    if (c.status !== "suspenso") return { ok: false, error: "Só é possível reativar um contrato suspenso." };
    await db.update(contracts).set({ status: "ativo" }).where(eq(contracts.id, contractId));
    const items = await db
      .select({ id: contractEquipment.id })
      .from(contractEquipment)
      .where(and(eq(contractEquipment.contractId, contractId), eq(contractEquipment.active, true)));
    const invoices = await generateInvoices({ contractIds: [contractId] });
    const wos = items.length ? await generateWorkOrders({ contractEquipmentIds: items.map((i) => i.id) }) : { created: 0 };
    revalidateContract(contractId, c.customerId);
    revalidatePath("/admin/financeiro/receber");
    return {
      ok: true,
      message:
        wos.created + invoices.created === 0
          ? "Contrato reativado: nada pendente para gerar agora"
          : `Contrato reativado: ${count(wos.created, "OM", "OMs")} e ${count(invoices.created, "mensalidade", "mensalidades")} ${
              wos.created + invoices.created === 1 ? "gerada" : "geradas"
            }`,
    };
  });
}

export async function cancelContract(contractId: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    const c = await loadContract(contractId);
    if (c.status === "cancelado" || c.status === "encerrado") return { ok: false, error: "Este contrato já está encerrado." };
    const today = todayISO();
    const r = await db.transaction(async (tx) => {
      await tx.update(contracts).set({ status: "cancelado" }).where(eq(contracts.id, contractId));
      await tx
        .update(contractEquipment)
        .set({ active: false, removedAt: new Date() })
        .where(and(eq(contractEquipment.contractId, contractId), eq(contractEquipment.active, true)));
      // abertas e agendadas, inclusive as atrasadas: sem contrato, nenhuma visita dele continua valendo
      const open = await openAutoWorkOrders({ contractId }, tx);
      return cancelEach(tx, open, user.id, () => "Contrato cancelado");
    });
    revalidateContract(contractId, c.customerId);
    return {
      ok: true,
      message: sentences(
        r.cancelled.length ? `Contrato cancelado e ${cancelledText(r.cancelled, today)}` : "Contrato cancelado",
        failedText(r.failed),
      ),
    };
  });
}

/* --------------------------------------------------------- gerar agora */

export async function generateContractWorkOrders(contractId: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const c = await loadContract(contractId);
    if (c.status !== "ativo") return { ok: false, error: "Contrato não está ativo: reative-o para gerar OMs." };
    const items = await db
      .select({ id: contractEquipment.id })
      .from(contractEquipment)
      .where(and(eq(contractEquipment.contractId, contractId), eq(contractEquipment.active, true)));
    if (!items.length) return { ok: false, error: "O contrato não tem equipamentos cobertos. Adicione um equipamento primeiro." };
    const r = await generateWorkOrders({ contractEquipmentIds: items.map((i) => i.id) });
    revalidateContract(contractId, c.customerId);
    if (r.errors.length) return { ok: false, error: `Algumas OMs não foram geradas: ${r.errors[0].message}` };
    if (r.blockedByOverdue > 0)
      return { ok: false, error: "Geração bloqueada: o cliente tem mensalidade vencida além do limite configurado. Regularize o financeiro e tente de novo." };
    if (r.created === 0)
      return {
        ok: true,
        message: r.equipmentChecked
          ? "Nenhuma OM nova: as visitas do horizonte configurado já foram geradas"
          : "Nenhuma OM gerada: confira se os equipamentos estão ativos e os planos têm tarefas",
      };
    return {
      ok: true,
      message: `${count(r.created, "OM gerada", "OMs geradas")}${r.withoutTechnician ? ` (${r.withoutTechnician} sem técnico definido)` : ""}`,
    };
  });
}

/* ---------------------------------------------------- equipamentos do contrato */

const addItemSchema = itemSchema;

export async function addContractItem(contractId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const c = await loadContract(contractId);
    if (c.status === "cancelado" || c.status === "encerrado") return { ok: false, error: "Contrato encerrado: não é possível incluir equipamentos." };
    const v = formValues(fd);
    const parsed = addItemSchema.safeParse({
      equipmentId: v.str("equipmentId") ?? "",
      maintenancePlanId: v.str("maintenancePlanId") ?? "",
      anchorDate: v.str("anchorDate") ?? undefined,
      preferredTechnicianId: v.str("preferredTechnicianId"),
    });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const d = parsed.data;
    const e = await db.query.equipment.findFirst({ where: eq(equipment.id, d.equipmentId), columns: { id: true, customerId: true, status: true, code: true } });
    if (!e || e.customerId !== c.customerId) return { ok: false, error: "Este equipamento não pertence ao cliente do contrato." };
    if (e.status === "removido") return { ok: false, error: `${formatEquipmentCode(e.code)} está marcado como removido.` };
    await assertPlansAndTechs([d.maintenancePlanId], d.preferredTechnicianId ? [d.preferredTechnicianId] : []);
    const [resume] = await resumeDatesFor([d]);
    let itemId: string;
    try {
      const [row] = await db
        .insert(contractEquipment)
        .values({
          contractId,
          equipmentId: d.equipmentId,
          maintenancePlanId: d.maintenancePlanId,
          anchorDate: d.anchorDate,
          preferredTechnicianId: d.preferredTechnicianId,
          lastGeneratedDueDate: resume,
        })
        .returning({ id: contractEquipment.id });
      itemId = row.id;
    } catch (err) {
      if (isUniqueViolation(err, "contract_equipment_active_uq"))
        return { ok: false, error: `${formatEquipmentCode(e.code)} já está em um contrato ativo. Remova-o de lá antes.` };
      throw err;
    }
    const wos = c.status === "ativo" ? await generateWorkOrders({ contractEquipmentIds: [itemId] }) : { created: 0 };
    revalidateContract(contractId, c.customerId);
    revalidatePath(`/admin/equipamentos/${d.equipmentId}`);
    return {
      ok: true,
      message: wos.created ? `Equipamento incluído: ${count(wos.created, "OM gerada", "OMs geradas")}` : "Equipamento incluído no contrato",
    };
  });
}

const updateItemSchema = z.object({
  maintenancePlanId: z.guid("Escolha o plano de manutenção."),
  anchorDate: isoDate,
  preferredTechnicianId: z.guid().nullable(),
  applyToOpen: z.boolean(),
});

export async function updateContractItem(itemId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    const item = await db.query.contractEquipment.findFirst({
      where: eq(contractEquipment.id, itemId),
      with: { contract: { columns: { id: true, customerId: true, status: true } } },
    });
    if (!item) return { ok: false, error: "Equipamento do contrato não encontrado." };
    if (!item.active) return { ok: false, error: "Este equipamento já foi removido do contrato." };
    const v = formValues(fd);
    const parsed = updateItemSchema.safeParse({
      maintenancePlanId: v.str("maintenancePlanId") ?? "",
      anchorDate: v.str("anchorDate") ?? undefined,
      preferredTechnicianId: v.str("preferredTechnicianId"),
      applyToOpen: v.bool("applyToOpen"),
    });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const d = parsed.data;
    await assertPlansAndTechs(
      d.maintenancePlanId !== item.maintenancePlanId ? [d.maintenancePlanId] : [],
      d.preferredTechnicianId && d.preferredTechnicianId !== item.preferredTechnicianId ? [d.preferredTechnicianId] : [],
    );

    // Âncora ou plano novos mudam as datas das visitas: as OMs feitas na agenda antiga são refeitas.
    const scheduleChanged = d.anchorDate !== item.anchorDate || d.maintenancePlanId !== item.maintenancePlanId;
    const schedule: ScheduleItem = {
      anchorDate: d.anchorDate,
      tasks: scheduleChanged
        ? await db.query.maintenancePlanTasks.findMany({
            where: eq(maintenancePlanTasks.planId, d.maintenancePlanId),
            columns: { id: true, frequencyMonths: true, position: true },
          })
        : [],
    };
    const today = todayISO();

    const r = await db.transaction(async (tx) => {
      await tx
        .update(contractEquipment)
        .set({ maintenancePlanId: d.maintenancePlanId, anchorDate: d.anchorDate, preferredTechnicianId: d.preferredTechnicianId })
        .where(eq(contractEquipment.id, itemId));
      const rescheduled = scheduleChanged ? await restartItemSchedule(tx, itemId, schedule, today, user.id) : null;
      if (!d.applyToOpen || d.preferredTechnicianId === item.preferredTechnicianId) return { rescheduled, reassigned: 0 };
      const open = await tx
        .select({ id: workOrders.id, technicianId: workOrders.technicianId })
        .from(workOrders)
        .where(and(eq(workOrders.contractEquipmentId, itemId), inArray(workOrders.status, ["aberta", "agendada"])));
      let reassigned = 0;
      for (const wo of open) {
        if (wo.technicianId === d.preferredTechnicianId) continue;
        await assignWorkOrder(tx, wo.id, { technicianId: d.preferredTechnicianId }, { userId: user.id });
        reassigned++;
      }
      return { rescheduled, reassigned };
    });

    // Fora da transação, como no cron diário: a agenda nova já aparece com as OMs do horizonte.
    const active = item.contract.status === "ativo";
    const generated = r.rescheduled && active ? await generateWorkOrders({ contractEquipmentIds: [itemId] }) : null;
    revalidateContract(item.contract.id, item.contract.customerId);
    revalidatePath(`/admin/equipamentos/${item.equipmentId}`);

    const parts: string[] = [];
    if (r.reassigned) parts.push(count(r.reassigned, "OM reatribuída", "OMs reatribuídas"));
    if (r.rescheduled) {
      const cancelled = r.rescheduled.cancelled;
      const created = generated?.created ?? 0;
      if (cancelled.length && created) parts.push(`${cancelledText(cancelled, today)} e ${created} ${created === 1 ? "gerada" : "geradas"} na nova agenda`);
      else if (created) parts.push(`${count(created, "OM gerada", "OMs geradas")} na nova agenda`);
      else if (cancelled.length)
        parts.push(
          `${cancelledText(cancelled, today)} (${active ? "a próxima visita da nova agenda sai com a rotina diária" : "a nova agenda é gerada quando o contrato for reativado"})`,
        );
    }
    return {
      ok: true,
      message: sentences(
        parts.length ? `Equipamento atualizado: ${parts.join(", ")}` : "Equipamento atualizado",
        r.rescheduled && failedText(r.rescheduled.failed),
        generated?.blockedByOverdue
          ? "As OMs da nova agenda estão bloqueadas: o cliente tem mensalidade vencida além do limite configurado"
          : generated?.errors.length
            ? `Não foi possível gerar as OMs da nova agenda: ${generated.errors[0].message}`
            : null,
      ),
    };
  });
}

/**
 * Refaz a agenda do item depois de mudar a âncora ou o plano: cancela as OMs automáticas abertas ou
 * agendadas de hoje em diante (feitas na agenda antiga) e reposiciona `lastGeneratedDueDate` logo após a
 * última visita que ficou, para o gerador criar as visitas da agenda nova sem repetir o ciclo dela.
 */
async function restartItemSchedule(tx: Tx, itemId: string, schedule: ScheduleItem, today: ISODate, userId: string) {
  const stale = await openAutoWorkOrders({ contractEquipmentId: itemId, from: today }, tx);
  const result = await cancelEach(
    tx,
    stale,
    userId,
    (wo) => `Agenda do equipamento alterada${wo.dueDate ? ` (visita prevista para ${formatDate(wo.dueDate)})` : ""}`,
  );
  const resume = resumeScheduleAfter(await lastAutoDueDate(tx, itemId), schedule.anchorDate, visitIntervalMonths(schedule.tasks));
  await tx.update(contractEquipment).set({ lastGeneratedDueDate: resume }).where(eq(contractEquipment.id, itemId));
  // O índice que impede OM duplicada (item + vencimento) também vale para as canceladas: quando a agenda
  // nova tem visita na mesma data de uma OM cancelada aqui, a OM cancelada libera a data (o vencimento
  // antigo fica na nota do cancelamento) para o gerador criar a visita com o plano novo.
  const reused = result.cancelled.filter((wo) => wo.dueDate && (!resume || wo.dueDate > resume) && isPlannedVisit(schedule, wo.dueDate));
  if (reused.length)
    await tx
      .update(workOrders)
      .set({ dueDate: null })
      .where(inArray(workOrders.id, reused.map((wo) => wo.id)));
  return result;
}

export async function removeContractItem(itemId: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole([...STAFF]);
    const item = await db.query.contractEquipment.findFirst({
      where: eq(contractEquipment.id, itemId),
      with: { contract: { columns: { id: true, customerId: true } } },
    });
    if (!item) return { ok: false, error: "Equipamento do contrato não encontrado." };
    if (!item.active) return { ok: false, error: "Este equipamento já foi removido do contrato." };
    const today = todayISO();
    const r = await db.transaction(async (tx) => {
      const [removed] = await tx
        .update(contractEquipment)
        .set({ active: false, removedAt: new Date() })
        .where(and(eq(contractEquipment.id, itemId), eq(contractEquipment.active, true)))
        .returning({ id: contractEquipment.id });
      if (!removed) return null;
      // abertas e agendadas, inclusive as atrasadas: fora do contrato, a visita não acontece por ele
      const open = await openAutoWorkOrders({ contractEquipmentId: itemId }, tx);
      return cancelEach(tx, open, user.id, () => "Equipamento removido do contrato");
    });
    if (!r) return { ok: false, error: "Este equipamento já foi removido do contrato." };
    revalidateContract(item.contract.id, item.contract.customerId);
    revalidatePath(`/admin/equipamentos/${item.equipmentId}`);
    return {
      ok: true,
      message: sentences(
        r.cancelled.length ? `Equipamento removido e ${cancelledText(r.cancelled, today)}` : "Equipamento removido do contrato",
        failedText(r.failed),
      ),
    };
  });
}
