"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  contractEquipment,
  contracts,
  customers,
  equipment,
  maintenancePlans,
  technicians,
  workOrders,
} from "@/db/schema";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { formatContractCode, formatEquipmentCode } from "@/lib/format";
import { generateInvoices } from "@/server/billing";
import { generateWorkOrders } from "@/server/scheduler";
import { assignWorkOrder, changeWorkOrderStatus } from "@/server/work-orders";
import { customerEquipmentWithCoverage, futureOpenWorkOrderIds, isUuid, type CoverageEquipment } from "./_lib/queries";

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
            data.items.map((i) => ({
              contractId: c.id,
              equipmentId: i.equipmentId,
              maintenancePlanId: i.maintenancePlanId,
              anchorDate: i.anchorDate,
              preferredTechnicianId: i.preferredTechnicianId,
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
      message: `Contrato reativado: ${count(wos.created, "OM", "OMs")} e ${count(invoices.created, "mensalidade", "mensalidades")} ${
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
    const woIds = await futureOpenWorkOrderIds({ contractId });
    await db.transaction(async (tx) => {
      await tx.update(contracts).set({ status: "cancelado" }).where(eq(contracts.id, contractId));
      await tx
        .update(contractEquipment)
        .set({ active: false, removedAt: new Date() })
        .where(and(eq(contractEquipment.contractId, contractId), eq(contractEquipment.active, true)));
      for (const id of woIds) {
        await changeWorkOrderStatus(tx, id, "cancelada", { userId: user.id }, "Contrato cancelado");
      }
    });
    revalidateContract(contractId, c.customerId);
    return {
      ok: true,
      message: woIds.length ? `Contrato cancelado e ${count(woIds.length, "OM futura cancelada", "OMs futuras canceladas")}` : "Contrato cancelado",
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

    const reassigned = await db.transaction(async (tx) => {
      await tx
        .update(contractEquipment)
        .set({ maintenancePlanId: d.maintenancePlanId, anchorDate: d.anchorDate, preferredTechnicianId: d.preferredTechnicianId })
        .where(eq(contractEquipment.id, itemId));
      if (!d.applyToOpen || d.preferredTechnicianId === item.preferredTechnicianId) return 0;
      const open = await tx
        .select({ id: workOrders.id, technicianId: workOrders.technicianId })
        .from(workOrders)
        .where(and(eq(workOrders.contractEquipmentId, itemId), inArray(workOrders.status, ["aberta", "agendada"])));
      let n = 0;
      for (const wo of open) {
        if (wo.technicianId === d.preferredTechnicianId) continue;
        await assignWorkOrder(tx, wo.id, { technicianId: d.preferredTechnicianId }, { userId: user.id });
        n++;
      }
      return n;
    });
    revalidateContract(item.contract.id, item.contract.customerId);
    return { ok: true, message: reassigned ? `Equipamento atualizado e ${count(reassigned, "OM reatribuída", "OMs reatribuídas")}` : "Equipamento atualizado" };
  });
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
    const woIds = await futureOpenWorkOrderIds({ contractEquipmentId: itemId });
    await db.transaction(async (tx) => {
      await tx.update(contractEquipment).set({ active: false, removedAt: new Date() }).where(eq(contractEquipment.id, itemId));
      for (const id of woIds) await changeWorkOrderStatus(tx, id, "cancelada", { userId: user.id }, "Equipamento removido do contrato");
    });
    revalidateContract(item.contract.id, item.contract.customerId);
    revalidatePath(`/admin/equipamentos/${item.equipmentId}`);
    return {
      ok: true,
      message: woIds.length ? `Equipamento removido e ${count(woIds.length, "OM futura cancelada", "OMs futuras canceladas")}` : "Equipamento removido do contrato",
    };
  });
}
