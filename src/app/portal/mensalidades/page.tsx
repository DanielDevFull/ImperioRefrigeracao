import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Receipt } from "lucide-react";
import { db } from "@/db";
import { receivables } from "@/db/schema";
import { EmptyState } from "@/components/system/empty-state";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { ReceivableStatusBadge } from "@/components/system/status";
import { Button } from "@/components/ui/button";
import { requireCustomer } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { formatBRL, formatDate } from "@/lib/format";
import { effectiveFinanceStatus, labelOf, paymentMethod } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { amountDueToday } from "@/server/billing";
import { getSettings } from "@/server/settings";
import { PayButton } from "../_components/pay-button";
import { contactLink } from "../_lib/data";
import { receivableSubtitle, receivableTitle } from "../_lib/pay";
import { capitalize } from "../_lib/copy";

export const metadata: Metadata = { title: "Mensalidades" };

type Rec = typeof receivables.$inferSelect;

const kindOrder = (r: Rec) => (r.kind === "mensalidade" ? 0 : 1);

export default async function MensalidadesPage() {
  const { customer } = await requireCustomer();
  const [rows, settings] = await Promise.all([
    db.query.receivables.findMany({
      where: eq(receivables.customerId, customer.id),
      orderBy: [desc(receivables.dueDate)],
    }),
    getSettings(),
  ]);
  const today = todayISO();
  const year = today.slice(0, 4);

  const toPay = rows
    .filter((r) => r.status === "aberto" || r.status === "em_analise")
    .sort((a, b) => kindOrder(a) - kindOrder(b) || a.dueDate.localeCompare(b.dueDate));
  const history = rows
    .filter((r) => r.status === "pago" || r.status === "cancelado")
    .sort(
      (a, b) =>
        kindOrder(a) - kindOrder(b) ||
        (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0) ||
        b.dueDate.localeCompare(a.dueDate),
    );

  const open = toPay.filter((r) => effectiveFinanceStatus(r.status, r.dueDate, today) === "aberto");
  const overdue = toPay.filter((r) => effectiveFinanceStatus(r.status, r.dueDate, today) === "vencido");
  const inReview = toPay.filter((r) => r.status === "em_analise");
  const overdueTotals = await Promise.all(overdue.map((r) => amountDueToday(r, today)));
  const updatedTotal = new Map(overdue.map((r, i) => [r.id, overdueTotals[i].total]));
  const paidThisYear = rows.filter((r) => r.status === "pago" && r.paidAt && todayISO(r.paidAt).startsWith(year));
  const sum = (xs: number[]) => Math.round(xs.reduce((s, n) => s + n, 0) * 100) / 100;
  const wa = contactLink(settings, "Olá! Tenho uma dúvida sobre as minhas mensalidades.");

  return (
    <div>
      <PageHeader
        title="Mensalidades"
        description="Pague por Pix e envie o comprovante aqui mesmo. A confirmação aparece nesta tela."
      />

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nenhuma cobrança por enquanto"
            description="Quando houver mensalidades do seu plano ou serviços avulsos, elas aparecem aqui para pagamento por Pix."
            action={
              wa ? (
                <Button asChild variant="outline">
                  <a href={wa} target="_blank" rel="noreferrer">
                    Falar com a Imperium
                  </a>
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <div className="space-y-8">
          <ReadoutBand
            items={[
              {
                label: "Em aberto",
                value: sum([...open, ...inReview].map((r) => r.amount - r.discount)),
                format: "brl",
                hint: inReview.length
                  ? `${inReview.length} comprovante${inReview.length === 1 ? "" : "s"} em análise`
                  : `${open.length} cobrança${open.length === 1 ? "" : "s"}`,
              },
              {
                label: "Vencidas",
                value: sum(overdueTotals.map((t) => t.total)),
                format: "brl",
                tone: overdue.length ? "red" : undefined,
                hint: overdue.length ? "Valor de hoje, com multa e juros" : "Nada vencido",
              },
              {
                label: `Pagas em ${year}`,
                value: sum(paidThisYear.map((r) => r.paidAmount ?? r.amount)),
                format: "brl",
                tone: "mint",
                hint: `${paidThisYear.length} pagamento${paidThisYear.length === 1 ? "" : "s"}`,
              },
            ]}
          />

          <section>
            <h2 className="font-display text-silver-brushed mb-3 text-xl font-semibold tracking-[0.02em]">Para pagar</h2>
            <Panel flush>
              {toPay.length === 0 ? (
                <EmptyState
                  className="py-10"
                  title="Tudo pago"
                  description="Você não tem cobranças em aberto. A próxima mensalidade aparece aqui alguns dias antes do vencimento."
                />
              ) : (
                <ul className="divide-y divide-rime">
                  {toPay.map((r) => {
                    const eff = effectiveFinanceStatus(r.status, r.dueDate, today);
                    return (
                      <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-silver">{capitalize(receivableTitle(r))}</p>
                          <p className="mt-0.5 text-xs text-steel">{receivableSubtitle(r)}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <ReceivableStatusBadge status={eff} />
                            <span className={cn("text-xs", eff === "vencido" ? "text-gauge-red" : "text-steel")}>
                              {r.dueDate < today ? "Venceu em" : "Vence em"} {formatDate(r.dueDate)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4 sm:justify-end">
                          <span className="text-right">
                            <span className="readout block text-lg font-semibold tabular-nums text-silver">
                              {formatBRL(updatedTotal.get(r.id) ?? r.amount - r.discount)}
                            </span>
                            {updatedTotal.has(r.id) && (
                              <span className="readout block text-xs text-steel">
                                original {formatBRL(r.amount - r.discount)}
                              </span>
                            )}
                          </span>
                          <PayButton receivable={r} settings={settings} label="Pagar" className="min-w-24" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </section>

          <section>
            <h2 className="font-display text-silver-brushed mb-3 text-xl font-semibold tracking-[0.02em]">Histórico</h2>
            <Panel flush>
              {history.length === 0 ? (
                <EmptyState
                  className="py-10"
                  title="Nenhum pagamento registrado ainda"
                  description="Depois que a Imperium confirmar o primeiro pagamento, o recibo fica disponível aqui."
                />
              ) : (
                <>
                  <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_7rem] gap-4 border-b border-rime px-5 py-2.5 text-xs text-steel md:grid">
                    <span>Cobrança</span>
                    <span>Vencimento</span>
                    <span>Pago em</span>
                    <span className="text-right">Valor pago</span>
                    <span />
                  </div>
                  <ul className="divide-y divide-rime">
                    {history.map((r) => (
                      <li
                        key={r.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_7rem]"
                      >
                        <div className="row-span-2 min-w-0 md:row-span-1">
                          <p className="truncate text-sm text-silver">{capitalize(receivableTitle(r))}</p>
                          <p className="mt-0.5 text-xs text-steel md:hidden">
                            {r.status === "pago" ? `Pago em ${formatDate(r.paidAt)}` : "Cancelada"}
                            {r.paymentMethod && r.status === "pago" ? ` por ${labelOf(paymentMethod, r.paymentMethod).label}` : ""}
                          </p>
                        </div>
                        <span className="readout hidden text-sm text-steel md:block">{formatDate(r.dueDate)}</span>
                        <span className="hidden text-sm md:block">
                          {r.status === "pago" ? (
                            <span className="readout text-silver">{formatDate(r.paidAt)}</span>
                          ) : (
                            <ReceivableStatusBadge status="cancelado" />
                          )}
                        </span>
                        <span className="readout text-right text-sm tabular-nums text-silver">
                          {r.status === "pago" ? formatBRL(r.paidAmount ?? r.amount) : <span className="text-steel line-through">{formatBRL(r.amount)}</span>}
                        </span>
                        <span className="text-right">
                          {r.status === "pago" && (
                            <Button asChild variant="ghost" size="sm" className="-mr-2.5 text-frost md:mr-0">
                              <Link href={`/portal/mensalidades/${r.id}/recibo`}>
                                <Receipt /> Recibo
                              </Link>
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          </section>
        </div>
      )}
    </div>
  );
}
