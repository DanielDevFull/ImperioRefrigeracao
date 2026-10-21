import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccounts,
  commissionPayouts,
  customers,
  financeCategories,
  payables,
  purchaseOrders,
  receivables,
  suppliers,
  technicians,
  workOrders,
} from "@/db/schema";
import { addCompetence, addDays, endOfMonth, startOfWeek, type ISODate } from "@/lib/dates";
import { PAGE_SIZE } from "@/lib/params";
import { round2 } from "@/server/core/billing";

/* ------------------------------------------------------------------ */
/* Expressões comuns                                                    */
/* ------------------------------------------------------------------ */

const TZ_SQL = sql.raw(`'America/Sao_Paulo'`);

/** Mês (YYYY-MM) do pagamento no fuso de São Paulo. */
const recPaidMonth = sql<string>`to_char(${receivables.paidAt} at time zone ${TZ_SQL}, 'YYYY-MM')`;
const payPaidMonth = sql<string>`to_char(${payables.paidAt} at time zone ${TZ_SQL}, 'YYYY-MM')`;
const recPaidSum = sql<number>`coalesce(sum(coalesce(${receivables.paidAmount}, ${receivables.amount})), 0)`.mapWith(Number);
const payPaidSum = sql<number>`coalesce(sum(coalesce(${payables.paidAmount}, ${payables.amount})), 0)`.mapWith(Number);

const monthLabel = (competence: string) => {
  const [y, m] = competence.split("-").map(Number);
  const s = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, 15)))
    .replace(".", "");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}/${String(y).slice(2)}`;
};

const ddmm = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/* ------------------------------------------------------------------ */
/* Opções de formulário                                                */
/* ------------------------------------------------------------------ */

export async function financeOptions() {
  const [cats, accounts, sups, custs] = await Promise.all([
    db.query.financeCategories.findMany({ orderBy: [asc(financeCategories.name)] }),
    db.query.bankAccounts.findMany({ where: eq(bankAccounts.active, true), orderBy: [asc(bankAccounts.createdAt)] }),
    db.query.suppliers.findMany({ where: eq(suppliers.active, true), orderBy: [asc(suppliers.name)], columns: { id: true, name: true } }),
    db
      .select({ id: customers.id, name: customers.name, tradeName: customers.tradeName })
      .from(customers)
      .orderBy(asc(customers.name)),
  ]);
  return {
    categories: cats,
    revenueCategories: cats.filter((c) => c.type === "receita" && c.active).map(({ id, name, color }) => ({ id, name, color })),
    expenseCategories: cats.filter((c) => c.type === "despesa" && c.active).map(({ id, name, color }) => ({ id, name, color })),
    bankAccounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    suppliers: sups,
    customers: custs,
  };
}

/** Todas as categorias (inclusive inativas), para a gestão de categorias. */
export async function allCategories() {
  return db.query.financeCategories.findMany({ orderBy: [desc(financeCategories.active), asc(financeCategories.name)] });
}

/* ------------------------------------------------------------------ */
/* Saldos                                                              */
/* ------------------------------------------------------------------ */

/** Saldo de cada conta: saldo inicial + recebimentos − pagamentos lançados nela. */
export async function bankBalances() {
  const [accounts, rec, pay] = await Promise.all([
    db.query.bankAccounts.findMany({ orderBy: [desc(bankAccounts.active), asc(bankAccounts.createdAt)] }),
    db
      .select({ accountId: receivables.bankAccountId, total: recPaidSum })
      .from(receivables)
      .where(eq(receivables.status, "pago"))
      .groupBy(receivables.bankAccountId),
    db
      .select({ accountId: payables.bankAccountId, total: payPaidSum })
      .from(payables)
      .where(eq(payables.status, "pago"))
      .groupBy(payables.bankAccountId),
  ]);
  const recBy = new Map(rec.map((r) => [r.accountId ?? "", r.total]));
  const payBy = new Map(pay.map((r) => [r.accountId ?? "", r.total]));
  const rows = accounts.map((a) => ({
    ...a,
    received: recBy.get(a.id) ?? 0,
    paid: payBy.get(a.id) ?? 0,
    balance: round2(a.initialBalance + (recBy.get(a.id) ?? 0) - (payBy.get(a.id) ?? 0)),
  }));
  const unassigned = round2((recBy.get("") ?? 0) - (payBy.get("") ?? 0));
  const total = round2(rows.reduce((s, r) => s + r.balance, 0) + unassigned);
  return { accounts: rows, unassigned, total };
}

/* ------------------------------------------------------------------ */
/* Visão geral                                                         */
/* ------------------------------------------------------------------ */

export async function getOverview(month: string, today: ISODate) {
  const currentMonth = today.slice(0, 7);
  const chartEnd = month > currentMonth ? currentMonth : month;
  const horizon = addDays(today, 30);

  const [recByMonth, payByMonth, initial, recCats, payCats, recKinds, openRec, openPay] = await Promise.all([
    db
      .select({ month: recPaidMonth, total: recPaidSum })
      .from(receivables)
      .where(eq(receivables.status, "pago"))
      .groupBy(recPaidMonth),
    db
      .select({ month: payPaidMonth, total: payPaidSum })
      .from(payables)
      .where(eq(payables.status, "pago"))
      .groupBy(payPaidMonth),
    db
      .select({ total: sql<number>`coalesce(sum(${bankAccounts.initialBalance}), 0)`.mapWith(Number) })
      .from(bankAccounts),
    db
      .select({ id: financeCategories.id, name: financeCategories.name, total: recPaidSum })
      .from(receivables)
      .leftJoin(financeCategories, eq(financeCategories.id, receivables.categoryId))
      .where(and(eq(receivables.status, "pago"), sql`${recPaidMonth} = ${month}`))
      .groupBy(financeCategories.id, financeCategories.name),
    db
      .select({ id: financeCategories.id, name: financeCategories.name, total: payPaidSum })
      .from(payables)
      .leftJoin(financeCategories, eq(financeCategories.id, payables.categoryId))
      .where(and(eq(payables.status, "pago"), sql`${payPaidMonth} = ${month}`))
      .groupBy(financeCategories.id, financeCategories.name),
    db
      .select({ kind: receivables.kind, total: recPaidSum })
      .from(receivables)
      .where(and(eq(receivables.status, "pago"), sql`${recPaidMonth} = ${month}`))
      .groupBy(receivables.kind),
    db
      .select({ dueDate: receivables.dueDate, amount: receivables.amount, discount: receivables.discount, status: receivables.status })
      .from(receivables)
      .where(and(inArray(receivables.status, ["aberto", "em_analise"]), lte(receivables.dueDate, horizon))),
    db
      .select({ dueDate: payables.dueDate, amount: payables.amount })
      .from(payables)
      .where(and(eq(payables.status, "aberto"), lte(payables.dueDate, horizon))),
  ]);

  const recMap = new Map(recByMonth.map((r) => [r.month, r.total]));
  const payMap = new Map(payByMonth.map((r) => [r.month, r.total]));
  const initialTotal = initial[0]?.total ?? 0;

  const allIn = recByMonth.reduce((s, r) => s + r.total, 0);
  const allOut = payByMonth.reduce((s, r) => s + r.total, 0);
  const balance = round2(initialTotal + allIn - allOut);

  // Fluxo realizado: 6 meses terminando no mês escolhido (no máximo o mês atual)
  const months = Array.from({ length: 6 }, (_, i) => addCompetence(chartEnd, i - 5));
  const cashFlow = months.map((m) => ({
    mes: monthLabel(m),
    entradas: round2(recMap.get(m) ?? 0),
    saidas: round2(payMap.get(m) ?? 0),
  }));
  const balanceTrend = months.map((m) => {
    let inn = 0;
    let out = 0;
    for (const [k, v] of recMap) if (k <= m) inn += v;
    for (const [k, v] of payMap) if (k <= m) out += v;
    return { mes: monthLabel(m), saldo: round2(initialTotal + inn - out) };
  });

  // Posição
  let toReceive30 = 0;
  let toReceive30Count = 0;
  let overdue = 0;
  let overdueCount = 0;
  for (const r of openRec) {
    const value = r.amount - r.discount;
    if (r.status === "aberto" && r.dueDate < today) {
      overdue += value;
      overdueCount++;
    } else if (r.dueDate >= today) {
      toReceive30 += value;
      toReceive30Count++;
    }
  }
  let toPay30 = 0;
  let toPay30Count = 0;
  let overduePay = 0;
  let overduePayCount = 0;
  for (const p of openPay) {
    if (p.dueDate < today) {
      overduePay += p.amount;
      overduePayCount++;
    } else {
      toPay30 += p.amount;
      toPay30Count++;
    }
  }

  // Previsto por semana (vencimentos de hoje até +30 dias)
  const weeks: { start: ISODate; entradas: number; saidas: number }[] = [];
  for (let w = startOfWeek(today); w <= horizon; w = addDays(w, 7)) weeks.push({ start: w, entradas: 0, saidas: 0 });
  const weekOf = (d: ISODate) => weeks.find((w) => d >= w.start && d < addDays(w.start, 7));
  for (const r of openRec) {
    if (r.dueDate < today) continue;
    const w = weekOf(r.dueDate);
    if (w) w.entradas += r.amount - r.discount;
  }
  for (const p of openPay) {
    if (p.dueDate < today) continue;
    const w = weekOf(p.dueDate);
    if (w) w.saidas += p.amount;
  }
  const forecast = weeks.map((w) => ({
    semana: ddmm(w.start < today ? today : w.start),
    entradas: round2(w.entradas),
    saidas: round2(w.saidas),
  }));

  const monthIn = round2(recMap.get(month) ?? 0);
  const monthOut = round2(payMap.get(month) ?? 0);

  const byTotal = (a: { total: number }, b: { total: number }) => b.total - a.total;
  return {
    balance,
    month: { received: monthIn, paid: monthOut, result: round2(monthIn - monthOut) },
    position: {
      toReceive30: round2(toReceive30),
      toReceive30Count,
      toPay30: round2(toPay30),
      toPay30Count,
      overdue: round2(overdue),
      overdueCount,
      overduePay: round2(overduePay),
      overduePayCount,
    },
    cashFlow,
    balanceTrend,
    forecast,
    forecastTotals: {
      entradas: round2(toReceive30),
      saidas: round2(toPay30),
      projected: round2(balance + toReceive30 - toPay30),
      until: horizon,
    },
    revenueByCategory: recCats
      .map((c) => ({ id: c.id, name: c.name ?? "Sem categoria", total: round2(c.total) }))
      .sort(byTotal),
    expenseByCategory: payCats
      .map((c) => ({ id: c.id, name: c.name ?? "Sem categoria", total: round2(c.total) }))
      .sort(byTotal),
    revenueByKind: recKinds.map((k) => ({ kind: k.kind, total: round2(k.total) })).sort(byTotal),
  };
}

/* ------------------------------------------------------------------ */
/* Contas a receber                                                    */
/* ------------------------------------------------------------------ */

export const RECEIVABLE_TABS = ["", "vencido", "em_analise", "pago", "cancelado", "todas"] as const;
export type ReceivableTab = (typeof RECEIVABLE_TABS)[number];

export type ReceivableFilters = {
  tab: ReceivableTab;
  month?: string;
  kind?: string;
  q?: string;
  page: number;
};

function receivableStatusCond(tab: ReceivableTab, today: ISODate): SQL | undefined {
  switch (tab) {
    case "":
      return inArray(receivables.status, ["aberto", "em_analise"]);
    case "vencido":
      return and(eq(receivables.status, "aberto"), lt(receivables.dueDate, today));
    case "em_analise":
      return eq(receivables.status, "em_analise");
    case "pago":
      return eq(receivables.status, "pago");
    case "cancelado":
      return eq(receivables.status, "cancelado");
    default:
      return undefined;
  }
}

function receivableBaseConds(f: Omit<ReceivableFilters, "tab" | "page">) {
  const conds: (SQL | undefined)[] = [];
  if (f.month) {
    conds.push(gte(receivables.dueDate, `${f.month}-01`), lte(receivables.dueDate, endOfMonth(`${f.month}-01`)));
  }
  if (f.kind === "mensalidade" || f.kind === "servico" || f.kind === "outro") conds.push(eq(receivables.kind, f.kind));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(customers.name, like), ilike(customers.tradeName, like), ilike(receivables.description, like)));
  }
  return conds;
}

function receivableOrder(tab: ReceivableTab) {
  switch (tab) {
    case "pago":
      return [desc(receivables.paidAt), desc(receivables.dueDate)];
    case "em_analise":
      return [asc(receivables.proofSentAt), asc(receivables.dueDate)];
    case "cancelado":
      return [desc(receivables.updatedAt)];
    case "todas":
      return [desc(receivables.dueDate), asc(receivables.description)];
    default:
      return [asc(receivables.dueDate), asc(receivables.description)];
  }
}

export async function listReceivables(f: ReceivableFilters, today: ISODate) {
  const base = receivableBaseConds(f);
  const where = and(...base, receivableStatusCond(f.tab, today));

  const [rows, totals, counts] = await Promise.all([
    db
      .select({
        id: receivables.id,
        kind: receivables.kind,
        description: receivables.description,
        competence: receivables.competence,
        dueDate: receivables.dueDate,
        amount: receivables.amount,
        discount: receivables.discount,
        fine: receivables.fine,
        interest: receivables.interest,
        paidAmount: receivables.paidAmount,
        paidAt: receivables.paidAt,
        status: receivables.status,
        paymentMethod: receivables.paymentMethod,
        pixTxid: receivables.pixTxid,
        proofUrl: receivables.proofUrl,
        proofSentAt: receivables.proofSentAt,
        notes: receivables.notes,
        contractId: receivables.contractId,
        workOrderId: receivables.workOrderId,
        workOrderNumber: workOrders.number,
        customerId: receivables.customerId,
        customerName: customers.name,
        customerTradeName: customers.tradeName,
        customerWhatsapp: customers.whatsapp,
        customerPhone: customers.phone,
        categoryName: financeCategories.name,
        bankAccountId: receivables.bankAccountId,
        bankAccountName: bankAccounts.name,
      })
      .from(receivables)
      .leftJoin(customers, eq(customers.id, receivables.customerId))
      .leftJoin(financeCategories, eq(financeCategories.id, receivables.categoryId))
      .leftJoin(bankAccounts, eq(bankAccounts.id, receivables.bankAccountId))
      .leftJoin(workOrders, eq(workOrders.id, receivables.workOrderId))
      .where(where)
      .orderBy(...receivableOrder(f.tab))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        amount: sql<number>`coalesce(sum(${receivables.amount} - ${receivables.discount}), 0)`.mapWith(Number),
        paid: sql<number>`coalesce(sum(case when ${receivables.status} = 'pago' then coalesce(${receivables.paidAmount}, ${receivables.amount}) else 0 end), 0)`.mapWith(Number),
        open: sql<number>`coalesce(sum(case when ${receivables.status} in ('aberto', 'em_analise') then ${receivables.amount} - ${receivables.discount} else 0 end), 0)`.mapWith(Number),
      })
      .from(receivables)
      .leftJoin(customers, eq(customers.id, receivables.customerId))
      .where(where),
    db
      .select({
        aberto: sql<number>`count(*) filter (where ${receivables.status} in ('aberto', 'em_analise'))`.mapWith(Number),
        vencido: sql<number>`count(*) filter (where ${receivables.status} = 'aberto' and ${receivables.dueDate} < ${today})`.mapWith(Number),
        em_analise: sql<number>`count(*) filter (where ${receivables.status} = 'em_analise')`.mapWith(Number),
        pago: sql<number>`count(*) filter (where ${receivables.status} = 'pago')`.mapWith(Number),
        cancelado: sql<number>`count(*) filter (where ${receivables.status} = 'cancelado')`.mapWith(Number),
        todas: sql<number>`count(*)`.mapWith(Number),
      })
      .from(receivables)
      .leftJoin(customers, eq(customers.id, receivables.customerId))
      .where(and(...base)),
  ]);

  return {
    rows,
    totals: {
      count: totals[0]?.count ?? 0,
      amount: round2(totals[0]?.amount ?? 0),
      paid: round2(totals[0]?.paid ?? 0),
      open: round2(totals[0]?.open ?? 0),
    },
    counts: counts[0] ?? { aberto: 0, vencido: 0, em_analise: 0, pago: 0, cancelado: 0, todas: 0 },
  };
}

/** Comprovantes aguardando conferência (sem filtros), para o destaque da página. */
export async function proofsPendingCount() {
  const [r] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(receivables)
    .where(eq(receivables.status, "em_analise"));
  return r?.n ?? 0;
}

export type ReceivableRow = Awaited<ReturnType<typeof listReceivables>>["rows"][number];

/* ------------------------------------------------------------------ */
/* Contas a pagar                                                      */
/* ------------------------------------------------------------------ */

export const PAYABLE_TABS = ["", "vencido", "pago", "cancelado", "todas"] as const;
export type PayableTab = (typeof PAYABLE_TABS)[number];

export type PayableFilters = {
  tab: PayableTab;
  month?: string;
  categoryId?: string;
  supplierId?: string;
  q?: string;
  page: number;
};

function payableStatusCond(tab: PayableTab, today: ISODate): SQL | undefined {
  switch (tab) {
    case "":
      return eq(payables.status, "aberto");
    case "vencido":
      return and(eq(payables.status, "aberto"), lt(payables.dueDate, today));
    case "pago":
      return eq(payables.status, "pago");
    case "cancelado":
      return eq(payables.status, "cancelado");
    default:
      return undefined;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function payableBaseConds(f: Omit<PayableFilters, "tab" | "page">) {
  const conds: (SQL | undefined)[] = [];
  if (f.month) conds.push(gte(payables.dueDate, `${f.month}-01`), lte(payables.dueDate, endOfMonth(`${f.month}-01`)));
  if (f.categoryId && UUID_RE.test(f.categoryId)) conds.push(eq(payables.categoryId, f.categoryId));
  if (f.supplierId && UUID_RE.test(f.supplierId)) conds.push(eq(payables.supplierId, f.supplierId));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(payables.description, like), ilike(payables.documentNumber, like), ilike(suppliers.name, like)));
  }
  return conds;
}

function payableOrder(tab: PayableTab) {
  switch (tab) {
    case "pago":
      return [desc(payables.paidAt), desc(payables.dueDate)];
    case "cancelado":
      return [desc(payables.updatedAt)];
    case "todas":
      return [desc(payables.dueDate), asc(payables.description)];
    default:
      return [asc(payables.dueDate), asc(payables.description)];
  }
}

export async function listPayables(f: PayableFilters, today: ISODate) {
  const base = payableBaseConds(f);
  const where = and(...base, payableStatusCond(f.tab, today));
  const [rows, totals, counts] = await Promise.all([
    db
      .select({
        id: payables.id,
        description: payables.description,
        documentNumber: payables.documentNumber,
        dueDate: payables.dueDate,
        amount: payables.amount,
        paidAmount: payables.paidAmount,
        paidAt: payables.paidAt,
        status: payables.status,
        paymentMethod: payables.paymentMethod,
        attachmentUrl: payables.attachmentUrl,
        notes: payables.notes,
        supplierId: payables.supplierId,
        supplierName: suppliers.name,
        categoryId: payables.categoryId,
        categoryName: financeCategories.name,
        categoryColor: financeCategories.color,
        bankAccountId: payables.bankAccountId,
        bankAccountName: bankAccounts.name,
        purchaseOrderId: payables.purchaseOrderId,
        purchaseOrderNumber: purchaseOrders.number,
        commissionPayoutId: payables.commissionPayoutId,
        payoutPeriod: commissionPayouts.period,
        payoutTechnician: technicians.name,
      })
      .from(payables)
      .leftJoin(suppliers, eq(suppliers.id, payables.supplierId))
      .leftJoin(financeCategories, eq(financeCategories.id, payables.categoryId))
      .leftJoin(bankAccounts, eq(bankAccounts.id, payables.bankAccountId))
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, payables.purchaseOrderId))
      .leftJoin(commissionPayouts, eq(commissionPayouts.id, payables.commissionPayoutId))
      .leftJoin(technicians, eq(technicians.id, commissionPayouts.technicianId))
      .where(where)
      .orderBy(...payableOrder(f.tab))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        amount: sql<number>`coalesce(sum(${payables.amount}), 0)`.mapWith(Number),
        paid: sql<number>`coalesce(sum(case when ${payables.status} = 'pago' then coalesce(${payables.paidAmount}, ${payables.amount}) else 0 end), 0)`.mapWith(Number),
        open: sql<number>`coalesce(sum(case when ${payables.status} = 'aberto' then ${payables.amount} else 0 end), 0)`.mapWith(Number),
      })
      .from(payables)
      .leftJoin(suppliers, eq(suppliers.id, payables.supplierId))
      .where(where),
    db
      .select({
        aberto: sql<number>`count(*) filter (where ${payables.status} = 'aberto')`.mapWith(Number),
        vencido: sql<number>`count(*) filter (where ${payables.status} = 'aberto' and ${payables.dueDate} < ${today})`.mapWith(Number),
        pago: sql<number>`count(*) filter (where ${payables.status} = 'pago')`.mapWith(Number),
        cancelado: sql<number>`count(*) filter (where ${payables.status} = 'cancelado')`.mapWith(Number),
        todas: sql<number>`count(*)`.mapWith(Number),
      })
      .from(payables)
      .leftJoin(suppliers, eq(suppliers.id, payables.supplierId))
      .where(and(...base)),
  ]);
  return {
    rows,
    totals: {
      count: totals[0]?.count ?? 0,
      amount: round2(totals[0]?.amount ?? 0),
      paid: round2(totals[0]?.paid ?? 0),
      open: round2(totals[0]?.open ?? 0),
    },
    counts: counts[0] ?? { aberto: 0, vencido: 0, pago: 0, cancelado: 0, todas: 0 },
  };
}

export type PayableRow = Awaited<ReturnType<typeof listPayables>>["rows"][number];
