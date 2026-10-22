import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { contracts, financeCategories, payables, receivables } from "@/db/schema";
import { todayISO, type ISODate } from "@/lib/dates";
import { formatBRL, formatCompetence } from "@/lib/format";
import { txidFor } from "@/lib/pix";
import { competencesToBill, lateCharges, round2 } from "./core/billing";
import { markPayoutPaid, releaseCommissionsForReceivable } from "./commissions";
import { notifyCustomer, notifyStaff } from "./notify";
import { getSettings } from "./settings";

type DbLike = Tx | typeof db;

async function categoryId(tx: DbLike, name: string, type: "receita" | "despesa", color = "#38a8ff") {
  const found = await tx.query.financeCategories.findFirst({
    where: and(eq(financeCategories.name, name), eq(financeCategories.type, type)),
  });
  if (found) return found.id;
  const [c] = await tx.insert(financeCategories).values({ name, type, color }).returning();
  return c.id;
}

/** Gera as mensalidades dos contratos ativos (idempotente por contrato + competência). */
export async function generateInvoices({ today = todayISO(), contractIds }: { today?: ISODate; contractIds?: string[] } = {}) {
  const settings = await getSettings();
  const active = await db.query.contracts.findMany({
    where: and(eq(contracts.status, "ativo"), contractIds?.length ? inArray(contracts.id, contractIds) : undefined),
  });
  if (!active.length) return { created: 0 };
  const catId = await categoryId(db, "Mensalidades", "receita");

  const existingRows = await db
    .select({ contractId: receivables.contractId, competence: receivables.competence })
    .from(receivables)
    .where(and(eq(receivables.kind, "mensalidade"), inArray(receivables.contractId, active.map((c) => c.id))));
  const existing = new Map<string, Set<string>>();
  for (const r of existingRows) {
    if (!r.contractId || !r.competence) continue;
    if (!existing.has(r.contractId)) existing.set(r.contractId, new Set());
    existing.get(r.contractId)!.add(r.competence);
  }

  let created = 0;
  for (const c of active) {
    const toBill = competencesToBill({
      startDate: c.startDate,
      endDate: c.endDate,
      billingDay: c.billingDay,
      today,
      leadDays: settings.invoiceLeadDays,
      existing: existing.get(c.id) ?? new Set(),
    });
    for (const b of toBill) {
      const [rec] = await db
        .insert(receivables)
        .values({
          customerId: c.customerId,
          contractId: c.id,
          categoryId: catId,
          kind: "mensalidade",
          description: `Mensalidade ${c.name} — ${formatCompetence(b.competence)}`,
          competence: b.competence,
          dueDate: b.dueDate,
          amount: c.monthlyAmount,
        })
        .onConflictDoNothing()
        .returning();
      if (rec) {
        created++;
        await db.update(receivables).set({ pixTxid: txidFor(rec.id) }).where(eq(receivables.id, rec.id));
        await notifyCustomer(db, c.customerId, {
          title: "Nova mensalidade disponível",
          body: `${formatCompetence(b.competence)}: ${formatBRL(c.monthlyAmount)}, vence em ${b.dueDate.split("-").reverse().join("/")}.`,
          link: "/portal/mensalidades",
        });
      }
    }
  }
  return { created };
}

/** Valores para quitar hoje (com multa e juros se vencida). */
export async function amountDueToday(rec: { amount: number; discount: number; dueDate: string }, today = todayISO()) {
  const s = await getSettings();
  const base = round2(rec.amount - (rec.discount ?? 0));
  return lateCharges({
    amount: base,
    dueDate: rec.dueDate,
    paidOn: today,
    finePercent: s.lateFinePercent,
    interestMonthlyPercent: s.lateInterestMonthlyPercent,
  });
}

/** Baixa de conta a receber (manual pela empresa ou ao aprovar comprovante). */
export async function confirmReceivable(
  tx: DbLike,
  id: string,
  input: {
    paidOn?: ISODate;
    paidAmount?: number;
    method?: "pix" | "boleto" | "cartao" | "dinheiro" | "transferencia" | "outro";
    bankAccountId?: string | null;
    waiveLateFees?: boolean;
    userId: string | null;
  },
) {
  const rec = await tx.query.receivables.findFirst({ where: eq(receivables.id, id) });
  if (!rec) throw new Error("Conta não encontrada.");
  if (rec.status === "pago") throw new Error("Esta conta já está paga.");
  if (rec.status === "cancelado") throw new Error("Esta conta foi cancelada.");
  const paidOn = input.paidOn ?? todayISO();
  const s = await getSettings(tx);
  const base = round2(rec.amount - rec.discount);
  const late = input.waiveLateFees
    ? { fine: 0, interest: 0, total: base }
    : lateCharges({ amount: base, dueDate: rec.dueDate, paidOn, finePercent: s.lateFinePercent, interestMonthlyPercent: s.lateInterestMonthlyPercent });
  const paidAmount = input.paidAmount ?? late.total;
  // multa e juros registrados só até o que foi efetivamente pago acima do valor original
  const excess = Math.max(0, round2(paidAmount - base));
  const fine = Math.min(late.fine, excess);
  const interest = Math.min(late.interest, round2(excess - fine));

  const [updated] = await tx
    .update(receivables)
    .set({
      status: "pago",
      paidAt: new Date(`${paidOn}T12:00:00-03:00`),
      paidAmount,
      fine,
      interest,
      paymentMethod: input.method ?? rec.paymentMethod ?? "pix",
      bankAccountId: input.bankAccountId ?? rec.bankAccountId,
      confirmedById: input.userId,
    })
    .where(and(eq(receivables.id, id), inArray(receivables.status, ["aberto", "em_analise"])))
    .returning();
  if (!updated) throw new Error("Esta conta acabou de ser alterada por outra pessoa. Atualize a página.");
  await releaseCommissionsForReceivable(tx, id);
  await notifyCustomer(tx, rec.customerId, {
    title: "Pagamento confirmado",
    body: `${rec.description}: ${formatBRL(paidAmount)}. Obrigado!`,
    link: "/portal/mensalidades",
  });
  return updated;
}

/** Cliente envia comprovante pelo portal → fica em análise. */
export async function submitProof(tx: DbLike, id: string, customerId: string, proofUrl: string, method: "pix" | "transferencia" | "boleto" = "pix") {
  const rec = await tx.query.receivables.findFirst({ where: and(eq(receivables.id, id), eq(receivables.customerId, customerId)) });
  if (!rec) throw new Error("Mensalidade não encontrada.");
  if (rec.status !== "aberto") throw new Error("Esta mensalidade não está em aberto.");
  await tx
    .update(receivables)
    .set({ status: "em_analise", proofUrl, proofSentAt: new Date(), paymentMethod: method })
    .where(eq(receivables.id, id));
  await notifyStaff(tx, {
    title: "Comprovante recebido",
    body: `${rec.description} — confira e confirme o pagamento.`,
    link: "/admin/financeiro/receber?status=em_analise",
  });
}

export async function rejectProof(tx: DbLike, id: string, reason: string) {
  const rec = await tx.query.receivables.findFirst({ where: eq(receivables.id, id) });
  if (!rec || rec.status !== "em_analise") throw new Error("Não há comprovante em análise para esta conta.");
  await tx.update(receivables).set({ status: "aberto", notes: reason }).where(eq(receivables.id, id));
  await notifyCustomer(tx, rec.customerId, {
    title: "Comprovante não confirmado",
    body: `${rec.description}: ${reason}`,
    link: "/portal/mensalidades",
  });
}

/** Baixa de conta a pagar; se for fechamento de comissão, marca as comissões como pagas. */
export async function payPayable(
  tx: DbLike,
  id: string,
  input: { paidOn?: ISODate; paidAmount?: number; method?: "pix" | "boleto" | "cartao" | "dinheiro" | "transferencia" | "outro"; bankAccountId?: string | null },
) {
  const p = await tx.query.payables.findFirst({ where: eq(payables.id, id) });
  if (!p) throw new Error("Conta não encontrada.");
  if (p.status !== "aberto") throw new Error("Esta conta não está em aberto.");
  const paidOn = input.paidOn ?? todayISO();
  const [updated] = await tx
    .update(payables)
    .set({
      status: "pago",
      paidAt: new Date(`${paidOn}T12:00:00-03:00`),
      paidAmount: input.paidAmount ?? p.amount,
      paymentMethod: input.method ?? "pix",
      bankAccountId: input.bankAccountId ?? p.bankAccountId,
    })
    .where(and(eq(payables.id, id), eq(payables.status, "aberto")))
    .returning();
  if (!updated) throw new Error("Esta conta acabou de ser alterada por outra pessoa. Atualize a página.");
  if (p.commissionPayoutId) await markPayoutPaid(tx, p.commissionPayoutId);
  return updated;
}
