import "server-only";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { contractEquipment, receivables, technicianAbsences } from "@/db/schema";
import { addDays, todayISO, type ISODate } from "@/lib/dates";
import { formatEquipmentCode } from "@/lib/format";
import { maxDaysOverdue } from "./core/billing";
import {
  dueDatesToGenerate,
  isTechnicianAbsent,
  scheduleDateFor,
  tasksDueOn,
  visitIntervalMonths,
} from "./core/schedule";
import { getSettings } from "./settings";
import { createWorkOrder } from "./work-orders";

/** Quantos dias para trás o gerador ainda cria OMs vencidas (ex.: rotina ficou parada). */
const GRACE_DAYS = 15;

export type GenerationSummary = {
  created: number;
  equipmentChecked: number;
  blockedByOverdue: number;
  withoutTechnician: number;
  errors: { contractEquipmentId: string; message: string }[];
};

/**
 * Gera as OMs preventivas de todos os equipamentos em contrato ativo, dentro do horizonte
 * configurado. Idempotente: o índice único (equipamento-de-contrato, vencimento) impede duplicatas.
 */
export async function generateWorkOrders({
  today = todayISO(),
  contractEquipmentIds,
}: { today?: ISODate; contractEquipmentIds?: string[] } = {}): Promise<GenerationSummary> {
  const settings = await getSettings();
  const until = addDays(today, settings.workOrderHorizonDays);
  const notBefore = addDays(today, -GRACE_DAYS);
  const summary: GenerationSummary = {
    created: 0,
    equipmentChecked: 0,
    blockedByOverdue: 0,
    withoutTechnician: 0,
    errors: [],
  };

  const items = await db.query.contractEquipment.findMany({
    where: and(
      eq(contractEquipment.active, true),
      contractEquipmentIds?.length ? inArray(contractEquipment.id, contractEquipmentIds) : undefined,
    ),
    with: {
      contract: { with: { customer: true } },
      equipment: { with: { type: true } },
      plan: { with: { tasks: true } },
    },
  });

  const eligible = items.filter(
    (ce) =>
      ce.contract.status === "ativo" &&
      ce.contract.customer.status === "ativo" &&
      ["ativo", "em_manutencao"].includes(ce.equipment.status) &&
      ce.plan.active &&
      ce.plan.tasks.length > 0,
  );

  // Inadimplência: bloqueia clientes com mensalidade vencida há mais de N dias
  const blockedCustomers = new Set<string>();
  if (settings.blockOverdueDays > 0) {
    const open = await db
      .select({ customerId: receivables.customerId, dueDate: receivables.dueDate })
      .from(receivables)
      .where(and(eq(receivables.status, "aberto"), eq(receivables.kind, "mensalidade"), lt(receivables.dueDate, today)));
    const byCustomer = new Map<string, string[]>();
    for (const r of open) {
      if (!r.customerId) continue;
      byCustomer.set(r.customerId, [...(byCustomer.get(r.customerId) ?? []), r.dueDate]);
    }
    for (const [cid, dates] of byCustomer) {
      if (maxDaysOverdue(dates, today) > settings.blockOverdueDays) blockedCustomers.add(cid);
    }
  }

  const absences = await db.query.technicianAbsences.findMany({
    where: and(lt(technicianAbsences.startDate, addDays(until, 1))),
  });
  const absencesByTech = new Map<string, { startDate: string; endDate: string }[]>();
  for (const a of absences) {
    absencesByTech.set(a.technicianId, [...(absencesByTech.get(a.technicianId) ?? []), a]);
  }

  for (const ce of eligible) {
    summary.equipmentChecked++;
    if (blockedCustomers.has(ce.contract.customerId)) {
      summary.blockedByOverdue++;
      continue;
    }
    const interval = visitIntervalMonths(ce.plan.tasks);
    const dates = dueDatesToGenerate({
      anchor: ce.anchorDate,
      intervalMonths: interval,
      lastGenerated: ce.lastGeneratedDueDate,
      notBefore: notBefore > ce.contract.startDate ? notBefore : ce.contract.startDate,
      until: ce.contract.endDate && ce.contract.endDate < until ? ce.contract.endDate : until,
    });
    if (!dates.length) continue;

    try {
      await db.transaction(async (tx) => {
        for (const due of dates) {
          const tasksOn = tasksDueOn(ce.plan.tasks, ce.anchorDate, due);
          if (!tasksOn.length) continue;
          const taskIds = new Set(tasksOn.map((t) => t.id));
          const scheduled = scheduleDateFor(due, today, settings.worksSaturday);
          let techId = ce.preferredTechnicianId ?? ce.contract.customer.defaultTechnicianId ?? null;
          if (techId && isTechnicianAbsent(absencesByTech.get(techId) ?? [], scheduled)) techId = null;
          if (!techId) summary.withoutTechnician++;

          const eqLabel = [ce.equipment.type?.name, ce.equipment.location].filter(Boolean).join(" — ") ||
            formatEquipmentCode(ce.equipment.code);
          const wo = await createWorkOrder(
            tx,
            {
              type: ce.plan.isPmoc ? "pmoc" : "preventiva",
              origin: "automatica",
              customerId: ce.contract.customerId,
              siteId: ce.equipment.siteId,
              equipmentId: ce.equipmentId,
              maintenancePlanId: ce.maintenancePlanId,
              contractEquipmentId: ce.id,
              technicianId: techId,
              scheduledDate: scheduled,
              dueDate: due,
              title: `${ce.plan.name} · ${eqLabel}`,
              description: `Visita prevista no plano "${ce.plan.name}" (contrato ${ce.contract.name}).`,
            },
            { userId: null },
            (t) => taskIds.has(t.id),
          );
          if (wo) summary.created++;
        }
        await tx
          .update(contractEquipment)
          .set({ lastGeneratedDueDate: dates[dates.length - 1] })
          .where(eq(contractEquipment.id, ce.id));
      });
    } catch (e) {
      summary.errors.push({ contractEquipmentId: ce.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return summary;
}

/** Problemas de cadastro que impedem a geração automática (mostrados no painel). */
export async function generationIssues() {
  const items = await db.query.contractEquipment.findMany({
    where: eq(contractEquipment.active, true),
    with: {
      contract: { columns: { id: true, name: true, status: true, customerId: true } },
      equipment: { columns: { id: true, code: true, status: true, siteId: true, location: true } },
      plan: { with: { tasks: { columns: { id: true } } } },
    },
  });
  const issues: { contractEquipmentId: string; contractId: string; equipmentId: string; problem: string }[] = [];
  for (const ce of items) {
    if (ce.contract.status !== "ativo") continue;
    const base = { contractEquipmentId: ce.id, contractId: ce.contract.id, equipmentId: ce.equipment.id };
    if (!ce.plan.active) issues.push({ ...base, problem: `Plano "${ce.plan.name}" está inativo.` });
    else if (!ce.plan.tasks.length) issues.push({ ...base, problem: `Plano "${ce.plan.name}" não tem tarefas.` });
    if (!ce.equipment.siteId) issues.push({ ...base, problem: `${formatEquipmentCode(ce.equipment.code)} sem endereço de atendimento.` });
    if (!["ativo", "em_manutencao"].includes(ce.equipment.status))
      issues.push({ ...base, problem: `${formatEquipmentCode(ce.equipment.code)} não está ativo.` });
  }
  return issues;
}

