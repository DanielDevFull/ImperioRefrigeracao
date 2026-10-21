import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/charts/bar-chart";
import { BarList } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { EmptyState } from "@/components/system/empty-state";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { todayISO } from "@/lib/dates";
import { formatBRL, formatCompetence, formatDate, formatPercent } from "@/lib/format";
import { param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { SetupSheet } from "./_components/setup-sheet";
import { MonthFilter } from "./_components/url-filters";
import { isMonth, kindLabel } from "./_lib/constants";
import { allCategories, bankBalances, getOverview } from "./_lib/queries";

export const metadata: Metadata = { title: "Financeiro" };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export default async function FinanceOverviewPage({ searchParams }: PageProps<"/admin/financeiro">) {
  const sp = await searchParams;
  const today = todayISO();
  const currentMonth = today.slice(0, 7);
  const rawMonth = param(sp, "mes");
  const month = isMonth(rawMonth) ? rawMonth : currentMonth;

  const [o, balances, categories] = await Promise.all([getOverview(month, today), bankBalances(), allCategories()]);
  const monthName = capitalize(formatCompetence(month));
  const activeAccounts = balances.accounts.filter((a) => a.active).length;
  const p = o.position;
  const hasMonthData = o.month.received > 0 || o.month.paid > 0;

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Caixa, contas a receber e a pagar, e o resultado de cada mês."
        actions={
          <>
            <MonthFilter current={currentMonth} />
            <SetupSheet
              categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type, color: c.color, active: c.active }))}
              accounts={balances.accounts}
              unassigned={balances.unassigned}
            />
          </>
        }
      />

      <ReadoutBand
        items={[
          {
            label: "Saldo atual",
            value: o.balance,
            format: "brl",
            tone: o.balance < 0 ? "red" : undefined,
            hint: activeAccounts === 1 ? "Em 1 conta" : `Somando ${activeAccounts} contas`,
          },
          {
            label: "A receber em 30 dias",
            value: p.toReceive30,
            format: "brl",
            hint: p.toReceive30Count ? plural(p.toReceive30Count, "conta", "contas") : "Nada previsto",
            href: "/admin/financeiro/receber",
          },
          {
            label: "A pagar em 30 dias",
            value: p.toPay30,
            format: "brl",
            hint: p.overduePayCount
              ? `Mais ${formatBRL(p.overduePay)} já vencidos`
              : p.toPay30Count
                ? plural(p.toPay30Count, "conta", "contas")
                : "Nada previsto",
            href: p.overduePayCount ? "/admin/financeiro/pagar?status=vencido" : "/admin/financeiro/pagar",
          },
          {
            label: "Inadimplência",
            value: p.overdue,
            format: "brl",
            tone: p.overdue > 0 ? "red" : "mint",
            hint: p.overdueCount ? plural(p.overdueCount, "conta vencida", "contas vencidas") : "Todos em dia",
            href: "/admin/financeiro/receber?status=vencido",
          },
        ]}
      />

      {/* Mês selecionado */}
      <section className="mt-10" aria-labelledby="mes-titulo">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="mes-titulo" className="font-display text-silver-brushed text-xl font-semibold tracking-[0.02em]">
            {monthName}
          </h2>
          <p className="text-sm text-steel">Regime de caixa: o que entrou e saiu de fato no mês.</p>
        </div>

        <ReadoutBand
          className="md:grid-cols-3"
          items={[
            { label: "Recebido no mês", value: o.month.received, format: "brl", href: `/admin/financeiro/receber?status=pago&mes=${month}` },
            { label: "Pago no mês", value: o.month.paid, format: "brl", href: `/admin/financeiro/pagar?status=pago&mes=${month}` },
            {
              label: "Resultado do mês",
              value: o.month.result,
              format: "brl",
              tone: o.month.result < 0 ? "red" : o.month.result > 0 ? "mint" : undefined,
              hint:
                o.month.received > 0 ? `Margem de ${formatPercent(o.month.result / o.month.received)}` : undefined,
            },
          ]}
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <Panel
            title="DRE simplificado"
            description={`Receitas e despesas pagas em ${formatCompetence(month)}`}
            flush
            className="lg:col-span-7"
          >
            {hasMonthData ? (
              <Dre revenue={o.revenueByCategory} expense={o.expenseByCategory} received={o.month.received} paid={o.month.paid} />
            ) : (
              <EmptyState
                title="Nenhum pagamento neste mês"
                description="Quando você confirmar recebimentos e pagamentos, o resultado aparece aqui."
                action={
                  <Link href="/admin/financeiro/receber" className="text-sm text-ice hover:text-frost">
                    Ver contas a receber
                  </Link>
                }
              />
            )}
          </Panel>

          <div className="grid gap-6 lg:col-span-5">
            <Panel title="Receitas por tipo" description="Mensalidades e serviços recebidos no mês">
              {o.revenueByKind.length ? (
                <BarList
                  format="brl"
                  items={o.revenueByKind.map((k) => ({
                    label: kindLabel[k.kind] ?? k.kind,
                    value: k.total,
                    hint: o.month.received > 0 ? formatPercent(k.total / o.month.received) : undefined,
                  }))}
                />
              ) : (
                <p className="text-sm text-steel">Nenhum recebimento no mês.</p>
              )}
            </Panel>
            <Panel title="Despesas por categoria" description="Pagamentos do mês">
              {o.expenseByCategory.length ? (
                <BarList
                  format="brl"
                  items={o.expenseByCategory.map((c) => ({
                    label: c.name,
                    value: c.total,
                    hint: o.month.paid > 0 ? formatPercent(c.total / o.month.paid) : undefined,
                  }))}
                />
              ) : (
                <p className="text-sm text-steel">Nenhum pagamento no mês.</p>
              )}
            </Panel>
          </div>
        </div>
      </section>

      {/* Histórico */}
      <section className="mt-10 grid gap-6 lg:grid-cols-3" aria-label="Histórico">
        <Panel
          title="Fluxo de caixa realizado"
          description="Entradas e saídas pagas nos últimos 6 meses"
          className="lg:col-span-2"
        >
          <BarChart
            data={o.cashFlow}
            xKey="mes"
            format="brl"
            height={260}
            series={[
              { key: "entradas", label: "Entradas" },
              { key: "saidas", label: "Saídas" },
            ]}
          />
        </Panel>
        <Panel title="Saldo acumulado" description="Saldo de todas as contas no fim de cada mês">
          <TrendChart data={o.balanceTrend} xKey="mes" format="brl" height={284} series={[{ key: "saldo", label: "Saldo" }]} />
        </Panel>
      </section>

      {/* Previsão */}
      <section className="mt-6">
        <Panel title="Previsto para os próximos 30 dias" description="Contas em aberto pelo vencimento, por semana (segunda a domingo)">
          <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
            <BarChart
              data={o.forecast}
              xKey="semana"
              format="brl"
              height={240}
              series={[
                { key: "entradas", label: "Entradas previstas" },
                { key: "saidas", label: "Saídas previstas" },
              ]}
            />
            <dl className="grid content-start gap-4 border-rime lg:border-l lg:pl-6">
              <div>
                <dt className="text-xs text-steel">Entradas previstas</dt>
                <dd className="readout mt-0.5 text-lg font-semibold text-silver">{formatBRL(o.forecastTotals.entradas)}</dd>
              </div>
              <div>
                <dt className="text-xs text-steel">Saídas previstas</dt>
                <dd className="readout mt-0.5 text-lg font-semibold text-silver">{formatBRL(o.forecastTotals.saidas)}</dd>
              </div>
              <div className="border-t border-rime pt-4">
                <dt className="text-xs text-steel">Saldo projetado em {formatDate(o.forecastTotals.until)}</dt>
                <dd
                  className={cn(
                    "readout mt-0.5 text-2xl font-semibold",
                    o.forecastTotals.projected < 0 ? "text-gauge-red" : "text-silver",
                  )}
                >
                  {formatBRL(o.forecastTotals.projected)}
                </dd>
                <p className="mt-1 text-xs text-steel">Saldo atual mais entradas, menos saídas. Não conta valores já vencidos.</p>
              </div>
            </dl>
          </div>
        </Panel>
      </section>
    </>
  );
}

function Dre({
  revenue,
  expense,
  received,
  paid,
}: {
  revenue: { id: string | null; name: string; total: number }[];
  expense: { id: string | null; name: string; total: number }[];
  received: number;
  paid: number;
}) {
  const share = (v: number) => (received > 0 ? formatPercent(v / received) : "—");
  const result = received - paid;
  return (
    <Table>
      <TableBody>
        <SectionRow label="Receitas" />
        {revenue.length === 0 && (
          <TableRow className="border-rime hover:bg-transparent">
            <TableCell colSpan={3} className="pl-8 text-sm text-steel">
              Nenhum recebimento confirmado no mês.
            </TableCell>
          </TableRow>
        )}
        {revenue.map((r) => (
          <LineRow key={r.id ?? "sem"} label={r.name} value={r.total} share={share(r.total)} />
        ))}
        <TotalRow label="Total de receitas" value={received} share={received > 0 ? "100%" : "—"} />
        <SectionRow label="Despesas" />
        {expense.length === 0 && (
          <TableRow className="border-rime hover:bg-transparent">
            <TableCell colSpan={3} className="pl-8 text-sm text-steel">
              Nenhuma despesa paga no mês.
            </TableCell>
          </TableRow>
        )}
        {expense.map((e) => (
          <LineRow key={e.id ?? "sem"} label={e.name} value={-e.total} share={share(e.total)} />
        ))}
        <TotalRow label="Total de despesas" value={-paid} share={share(paid)} />
        <TableRow className="border-0 bg-ice/[0.05] hover:bg-ice/[0.05]">
          <TableCell className="py-3.5 pl-5 text-sm font-semibold text-silver">Resultado do mês</TableCell>
          <TableCell
            className={cn("py-3.5 text-right text-base font-semibold tabular-nums", result < 0 ? "text-gauge-red" : "text-mint")}
          >
            {formatBRL(result)}
          </TableCell>
          <TableCell className="w-20 py-3.5 pr-5 text-right text-xs tabular-nums text-steel">{share(result)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function SectionRow({ label }: { label: string }) {
  return (
    <TableRow className="border-rime hover:bg-transparent">
      <TableCell colSpan={2} className="pl-5 pt-4 text-xs font-medium text-steel">
        {label}
      </TableCell>
      <TableCell className="w-20 pr-5 pt-4 text-right text-xs text-steel/70">% receita</TableCell>
    </TableRow>
  );
}

function LineRow({ label, value, share }: { label: string; value: number; share: string }) {
  return (
    <TableRow className="border-rime/60">
      <TableCell className="pl-8 text-sm text-silver/90">{label}</TableCell>
      <TableCell className={cn("text-right text-sm tabular-nums", value < 0 ? "text-silver/90" : "text-silver")}>
        {formatBRL(value)}
      </TableCell>
      <TableCell className="w-20 pr-5 text-right text-xs tabular-nums text-steel">{share}</TableCell>
    </TableRow>
  );
}

function TotalRow({ label, value, share }: { label: string; value: number; share: string }) {
  return (
    <TableRow className="border-rime hover:bg-transparent">
      <TableCell className="pl-5 text-sm font-medium text-silver">{label}</TableCell>
      <TableCell className="text-right text-sm font-medium tabular-nums text-silver">{formatBRL(value)}</TableCell>
      <TableCell className="w-20 pr-5 text-right text-xs tabular-nums text-steel">{share}</TableCell>
    </TableRow>
  );
}
