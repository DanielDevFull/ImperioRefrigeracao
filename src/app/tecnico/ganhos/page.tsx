import type { Metadata } from "next";
import Link from "next/link";
import { CircleDollarSign } from "lucide-react";
import { AnimatedNumber } from "@/components/brand/animated-number";
import { BarChart } from "@/components/charts/bar-chart";
import { EmptyState } from "@/components/system/empty-state";
import { PageHeader } from "@/components/system/page-header";
import { CommissionStatusBadge, WorkOrderTypeBadge } from "@/components/system/status";
import { requireTechnician } from "@/lib/auth/session";
import { addCompetence, competenceOf, todayISO } from "@/lib/dates";
import { formatBRL, formatCompetence, formatDate, formatNumber, formatOM } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getSettings } from "@/server/settings";
import { capitalize } from "../_lib/board";
import { customerName, earnings } from "../_lib/queries";

export const metadata: Metadata = { title: "Meus ganhos" };

const MONTH_SHORT = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const short = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return MONTH_SHORT.format(new Date(Date.UTC(y, m - 1, 15))).replace(".", "");
};

function rateLabel(basis: string, rate: number, base: number) {
  if (basis === "fixo_por_om") return `Valor fixo por OM`;
  const pct = `${formatNumber(rate)}%`;
  const of =
    basis === "percentual_total" ? "do total da OM" : basis === "percentual_materiais" ? "dos materiais cobrados" : "da mão de obra";
  return `${pct} ${of} (${formatBRL(base)})`;
}

export default async function TechEarningsPage({ searchParams }: PageProps<"/tecnico/ganhos">) {
  const { technician } = await requireTechnician();
  const sp = await searchParams;
  const current = competenceOf(todayISO());
  const months = Array.from({ length: 6 }, (_, i) => addCompetence(current, i - 5));
  const requested = typeof sp.mes === "string" ? sp.mes : current;
  const period = months.includes(requested) ? requested : current;

  const [{ entries, totals, series }, settings] = await Promise.all([earnings(technician.id, period), getSettings()]);
  const total = totals.pendente + totals.aprovada + totals.paga;
  const monthName = formatCompetence(period).split(" de ")[0];

  return (
    <div className="space-y-6">
      <PageHeader title="Meus ganhos" description="Comissões das OMs que você concluiu." />

      <nav aria-label="Mês" className="grid grid-cols-6 gap-1.5">
        {months.map((m) => {
          const active = m === period;
          return (
            <Link
              key={m}
              href={m === current ? "/tecnico/ganhos" : `/tecnico/ganhos?mes=${m}`}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 flex-col items-center justify-center rounded-xl text-sm ring-1 transition-colors",
                active ? "bg-ice/15 font-semibold text-silver ring-ice/35" : "bg-night/50 text-steel ring-rime active:bg-ice/5",
              )}
            >
              {short(m)}
            </Link>
          );
        })}
      </nav>

      <section className="glass frost-edge overflow-hidden rounded-3xl" aria-label="Resumo do mês">
        <div className="px-5 pb-4 pt-5">
          <p className="text-sm text-steel">Comissão de {monthName}</p>
          <AnimatedNumber key={period} value={total} format="brl" className="readout mt-1 block text-[2.4rem] font-semibold leading-none text-mint" />
          <p className="mt-2 text-xs text-steel">
            {entries.length === 0 ? "Nenhuma OM com comissão neste mês." : entries.length === 1 ? "1 OM com comissão" : `${entries.length} OMs com comissão`}
          </p>
        </div>
        <dl className="grid grid-cols-3 border-t border-rime">
          {(
            [
              ["pendente", "Prevista", "text-frost"],
              ["aprovada", "Liberada", "text-ice"],
              ["paga", "Paga", "text-mint"],
            ] as const
          ).map(([k, label, tone], i) => (
            <div key={k} className={cn("px-3 py-3.5 text-center", i > 0 && "border-l border-rime")}>
              <dt className="text-xs text-steel">{label}</dt>
              <dd className={cn("readout mt-0.5 text-[0.95rem] font-semibold", totals[k] ? tone : "text-steel/70")}>{formatBRL(totals[k])}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="g-6m" className="panel p-4">
        <h2 id="g-6m" className="mb-2 text-sm font-medium text-silver">
          Últimos 6 meses
        </h2>
        <BarChart
          data={series.map((s) => ({ mes: capitalize(short(s.period)), total: s.total }))}
          xKey="mes"
          series={[{ key: "total", label: "Comissão" }]}
          format="brl"
          height={180}
        />
      </section>

      <section aria-labelledby="g-lanc" className="space-y-3">
        <h2 id="g-lanc" className="font-display text-silver-brushed text-xl font-semibold">
          Lançamentos de {monthName}
        </h2>
        {entries.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<CircleDollarSign className="size-6 text-frost" />}
              title="Nenhuma comissão neste mês"
              description={period === current ? "Conclua as OMs de hoje para ver a comissão aparecer aqui na hora." : "Escolha outro mês acima."}
              action={
                period === current ? (
                  <Link href="/tecnico" className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-medium text-ice ring-1 ring-ice/30">
                    Ver OMs de hoje
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ul className="panel divide-y divide-rime overflow-hidden">
            {entries.map((e) => (
              <li key={e.id}>
                <Link href={`/tecnico/om/${e.workOrderId}`} className="block px-4 py-3.5 active:bg-ice/5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-[0.95rem] font-medium text-silver">{customerName(e.workOrder?.customer)}</p>
                    <span className="readout shrink-0 text-[0.95rem] font-semibold text-silver">{formatBRL(e.amount)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-xs text-steel">
                      <span className="readout">{formatOM(e.workOrder?.number)}</span>
                      {e.workOrder?.finishedAt ? `, ${formatDate(e.workOrder.finishedAt)}` : ""}
                    </p>
                    <CommissionStatusBadge status={e.status} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {e.workOrder && <WorkOrderTypeBadge type={e.workOrder.type} />}
                    <span className="text-xs text-steel">{rateLabel(e.basis, e.rate, e.baseAmount)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="g-como" className="panel space-y-3 p-4 text-sm leading-relaxed text-steel">
        <h2 id="g-como" className="text-[0.95rem] font-semibold text-silver">
          Como a comissão funciona
        </h2>
        <p>
          <span className="font-medium text-frost">Prevista</span> e <span className="font-medium text-ice">Liberada</span>:{" "}
          {settings.commissionTrigger === "recebimento"
            ? "nas OMs cobradas à parte do contrato, a comissão fica prevista até o cliente pagar o serviço; as visitas de contrato são liberadas assim que você conclui a OM."
            : "a comissão é liberada assim que você conclui a OM no app."}
        </p>
        <p>
          <span className="font-medium text-mint">Paga</span>: no fechamento mensal o escritório soma as comissões liberadas e faz o pagamento. Depois de pagas, elas aparecem aqui como pagas.
        </p>
        <p>Se uma OM for reaberta ou cancelada, a comissão dela é estornada até ser concluída de novo.</p>
      </section>
    </div>
  );
}
