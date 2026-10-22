import "server-only";
import { and, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  commissionEntries,
  commissionPayouts,
  commissionRules,
  financeCategories,
  payables,
  receivables,
  technicians,
  workOrderMaterials,
  workOrders,
} from "@/db/schema";
import { addDays, competenceOf, todayISO } from "@/lib/dates";
import { formatCompetence } from "@/lib/format";
import { round2 } from "./core/billing";
import { computeCommission, pickRule } from "./core/commission";
import { notifyTechnician } from "./notify";
import { getSettings } from "./settings";

type DbLike = Tx | typeof db;

export async function materialsChargedFor(tx: DbLike, workOrderId: string) {
  const [row] = await tx
    .select({
      charged: sql<number>`coalesce(sum(case when ${workOrderMaterials.chargeCustomer} then ${workOrderMaterials.quantity} * ${workOrderMaterials.unitPrice} else 0 end), 0)::float`,
    })
    .from(workOrderMaterials)
    .where(eq(workOrderMaterials.workOrderId, workOrderId));
  return round2(Number(row?.charged ?? 0));
}

/**
 * Calcula a comissão do técnico ao concluir a OM.
 * Gatilho "conclusao": já nasce liberada. Gatilho "recebimento": fica prevista
 * até o valor cobrado da OM ser recebido (OMs de contrato são liberadas na conclusão).
 */
export async function createCommissionForWorkOrder(tx: DbLike, workOrderId: string) {
  const wo = await tx.query.workOrders.findFirst({ where: eq(workOrders.id, workOrderId) });
  if (!wo?.technicianId || wo.status !== "concluida") return null;

  const rules = await tx.query.commissionRules.findMany({ where: eq(commissionRules.active, true) });
  const rule = pickRule(rules, wo.technicianId, wo.type);
  if (!rule) return null;

  const materialsCharged = await materialsChargedFor(tx, wo.id);
  const { base, amount } = computeCommission(rule, { labor: wo.laborAmount, materialsCharged });
  if (amount <= 0) return null;

  const settings = await getSettings(tx);
  let waitsPayment = settings.commissionTrigger === "recebimento" && wo.billable && wo.totalAmount > 0;
  if (waitsPayment && wo.receivableId) {
    // a cobrança já foi recebida (ex.: OM reaberta e concluída de novo): libera direto
    const rec = await tx.query.receivables.findFirst({ where: eq(receivables.id, wo.receivableId), columns: { status: true } });
    if (rec?.status === "pago") waitsPayment = false;
  }
  const status = waitsPayment ? "pendente" : "aprovada";
  const finished = wo.finishedAt ? todayISO(wo.finishedAt) : todayISO();

  const [entry] = await tx
    .insert(commissionEntries)
    .values({
      technicianId: wo.technicianId,
      workOrderId: wo.id,
      ruleId: rule.id,
      basis: rule.basis,
      baseAmount: base,
      rate: rule.rate,
      amount,
      period: competenceOf(finished),
      status,
    })
    .onConflictDoUpdate({
      target: [commissionEntries.workOrderId, commissionEntries.technicianId],
      set: { ruleId: rule.id, basis: rule.basis, baseAmount: base, rate: rule.rate, amount, status, updatedAt: new Date() },
      // nunca altera comissão já paga ou dentro de um fechamento
      where: and(ne(commissionEntries.status, "paga"), isNull(commissionEntries.payoutId)),
    })
    .returning();

  if (entry) {
    await notifyTechnician(tx, wo.technicianId, {
      title: status === "aprovada" ? "Comissão liberada" : "Comissão prevista",
      body: `R$ ${amount.toFixed(2).replace(".", ",")} pela OM concluída.`,
      link: "/tecnico/ganhos",
    });
  }
  return entry ?? null;
}

/** Estorna comissões não pagas de uma OM (cancelamento ou reabertura). */
export async function cancelCommissionsForWorkOrder(tx: DbLike, workOrderId: string) {
  await tx
    .update(commissionEntries)
    .set({ status: "cancelada", updatedAt: new Date() })
    .where(and(eq(commissionEntries.workOrderId, workOrderId), inArray(commissionEntries.status, ["pendente", "aprovada"]), isNull(commissionEntries.payoutId)));
}

/** Libera comissões que aguardavam o recebimento da conta vinculada à OM. */
export async function releaseCommissionsForReceivable(tx: DbLike, receivableId: string) {
  const wos = await tx.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.receivableId, receivableId));
  if (!wos.length) return;
  await tx
    .update(commissionEntries)
    .set({ status: "aprovada", updatedAt: new Date() })
    .where(and(inArray(commissionEntries.workOrderId, wos.map((w) => w.id)), eq(commissionEntries.status, "pendente")));
}

async function commissionCategoryId(tx: DbLike) {
  const found = await tx.query.financeCategories.findFirst({
    where: and(eq(financeCategories.name, "Comissões"), eq(financeCategories.type, "despesa")),
  });
  if (found) return found.id;
  const [c] = await tx.insert(financeCategories).values({ name: "Comissões", type: "despesa", color: "#9b8cff" }).returning();
  return c.id;
}

/**
 * Fecha a comissão do técnico na competência: agrupa as comissões liberadas
 * até o período, cria o fechamento e a conta a pagar correspondente.
 */
export async function closeCommissionPayout(
  tx: DbLike,
  { technicianId, period }: { technicianId: string; period: string },
) {
  // trava as linhas: dois cliques simultâneos em "Fechar comissão" não geram dois fechamentos
  const entries = await tx
    .select()
    .from(commissionEntries)
    .where(
      and(
        eq(commissionEntries.technicianId, technicianId),
        eq(commissionEntries.status, "aprovada"),
        isNull(commissionEntries.payoutId),
        lte(commissionEntries.period, period),
      ),
    )
    .for("update");
  if (!entries.length) throw new Error("Não há comissões liberadas para fechar neste período.");
  const total = round2(entries.reduce((s, e) => s + e.amount, 0));
  const tech = await tx.query.technicians.findFirst({ where: eq(technicians.id, technicianId) });

  const [payout] = await tx
    .insert(commissionPayouts)
    .values({ technicianId, period, totalAmount: total })
    .returning();
  const [payable] = await tx
    .insert(payables)
    .values({
      description: `Comissão ${tech?.name ?? "técnico"} — ${formatCompetence(period)}`,
      categoryId: await commissionCategoryId(tx),
      dueDate: addDays(todayISO(), 5),
      amount: total,
      commissionPayoutId: payout.id,
    })
    .returning();
  await tx.update(commissionPayouts).set({ payableId: payable.id }).where(eq(commissionPayouts.id, payout.id));
  const linked = await tx
    .update(commissionEntries)
    .set({ payoutId: payout.id, updatedAt: new Date() })
    .where(and(inArray(commissionEntries.id, entries.map((e) => e.id)), isNull(commissionEntries.payoutId)))
    .returning({ id: commissionEntries.id });
  if (linked.length !== entries.length) {
    throw new Error("Outra pessoa acabou de fechar estas comissões. Atualize a página.");
  }
  return { payout, payable, count: entries.length, total };
}

/** Chamado quando a conta a pagar de um fechamento é paga. */
export async function markPayoutPaid(tx: DbLike, payoutId: string) {
  const now = new Date();
  const [paid] = await tx
    .update(commissionPayouts)
    .set({ status: "pago", paidAt: now })
    .where(and(eq(commissionPayouts.id, payoutId), eq(commissionPayouts.status, "aberto")))
    .returning({ id: commissionPayouts.id });
  if (!paid) throw new Error("Este fechamento de comissão foi desfeito. Atualize a página.");
  await tx
    .update(commissionEntries)
    .set({ status: "paga", updatedAt: now })
    .where(eq(commissionEntries.payoutId, payoutId));
  const p = await tx.query.commissionPayouts.findFirst({ where: eq(commissionPayouts.id, payoutId) });
  if (p) {
    await notifyTechnician(tx, p.technicianId, {
      title: "Comissão paga",
      body: `Fechamento de ${formatCompetence(p.period)} pago.`,
      link: "/tecnico/ganhos",
    });
  }
}

/** Comissão da OM que está num fechamento ainda não pago (impede reabrir/cancelar sem desfazer o fechamento). */
export async function commissionInOpenPayout(tx: DbLike, workOrderId: string) {
  const rows = await tx
    .select({ payoutId: commissionEntries.payoutId, status: commissionPayouts.status })
    .from(commissionEntries)
    .innerJoin(commissionPayouts, eq(commissionPayouts.id, commissionEntries.payoutId))
    .where(and(eq(commissionEntries.workOrderId, workOrderId), eq(commissionPayouts.status, "aberto")));
  return rows.length > 0;
}
