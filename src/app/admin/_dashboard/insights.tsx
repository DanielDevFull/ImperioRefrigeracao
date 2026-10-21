import Link from "next/link";
import { BarChart } from "@/components/charts/bar-chart";
import { BarList } from "@/components/charts/bar-list";
import { Panel } from "@/components/system/panel";
import { toneText } from "@/components/system/tone-badge";
import { formatBRL, formatPercent } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { getOpenByTechnician, getPreventiveByMonth, getRevenueByMonth } from "./queries";
import { monthLabel, monthName, plural } from "./util";

type Revenue = Awaited<ReturnType<typeof getRevenueByMonth>>;
type Preventive = Awaited<ReturnType<typeof getPreventiveByMonth>>;
type OpenByTech = Awaited<ReturnType<typeof getOpenByTechnician>>;

export function RevenuePanel({ data }: { data: Revenue }) {
  const totals = data.map((d) => d.recurring + d.services);
  const total = totals.reduce((s, v) => s + v, 0);
  const closed = data.slice(0, -1);
  const avg = closed.length ? closed.reduce((s, d) => s + d.recurring + d.services, 0) / closed.length : 0;
  const current = data[data.length - 1];
  const currentTotal = current.recurring + current.services;
  const chart = data.map((d) => ({ mes: monthLabel(d.month), mensalidades: d.recurring, servicos: d.services }));
  return (
    <Panel title="Receita recebida" description="Pagamentos confirmados nos últimos 6 meses">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-[1.6rem] font-semibold leading-none text-silver">{formatBRL(total)}</p>
          <p className="mt-1.5 text-xs text-steel">no período, média de {formatBRL(avg)} por mês fechado</p>
        </div>
        <p className="text-xs text-steel">
          {monthName(current.month).replace(/^./, (c) => c.toUpperCase())} até agora:{" "}
          <span className="tabular-nums text-silver">{formatBRL(currentTotal)}</span>
        </p>
      </div>
      {total > 0 ? (
        <BarChart
          data={chart}
          xKey="mes"
          stacked
          format="brl"
          height={200}
          series={[
            { key: "mensalidades", label: "Mensalidades" },
            { key: "servicos", label: "Serviços" },
          ]}
        />
      ) : (
        <p className="py-10 text-center text-sm text-steel">
          Nenhum pagamento confirmado nos últimos 6 meses. As baixas feitas em{" "}
          <Link href="/admin/financeiro/receber" className="text-frost hover:underline">
            Contas a receber
          </Link>{" "}
          aparecem aqui.
        </p>
      )}
    </Panel>
  );
}

export function PreventivePanel({ data }: { data: Preventive }) {
  const chart = data.series.map((d) => ({ mes: monthLabel(d.month), previstas: d.planned, concluidas: d.done }));
  const c = data.compliance;
  const tone: Tone | null = c == null ? null : c >= 0.95 ? "mint" : c >= 0.8 ? "brass" : "red";
  const any = data.series.some((d) => d.planned > 0);
  return (
    <Panel title="Preventivas do plano" description="Visitas previstas e concluídas por mês de vencimento">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className={cn("text-[1.6rem] font-semibold leading-none", tone ? toneText[tone] : "text-silver")}>
            {c == null ? "—" : formatPercent(c)}
          </p>
          <p className="mt-1.5 text-xs text-steel">
            {c == null
              ? "Ainda não há visitas vencidas no período"
              : `de cumprimento: ${data.pastDone} de ${data.pastPlanned} visitas vencidas foram feitas`}
          </p>
        </div>
        {data.pending > 0 && (
          <Link href="/admin/oms?filtro=atrasadas" className="text-xs text-brass hover:underline">
            {data.pending} {plural(data.pending, "visita atrasada", "visitas atrasadas")}
          </Link>
        )}
      </div>
      {any ? (
        <BarChart
          data={chart}
          xKey="mes"
          format="integer"
          height={200}
          series={[
            { key: "previstas", label: "Previstas" },
            { key: "concluidas", label: "Concluídas" },
          ]}
        />
      ) : (
        <p className="py-10 text-center text-sm text-steel">
          Sem preventivas no período. Vincule equipamentos a um plano em{" "}
          <Link href="/admin/contratos" className="text-frost hover:underline">
            Contratos
          </Link>
          .
        </p>
      )}
    </Panel>
  );
}

export function LoadPanel({ data }: { data: OpenByTech }) {
  const total = data.reduce((s, r) => s + r.count, 0);
  const items = data.map((r) => ({
    label: r.technicianId ? (r.name ?? "Técnico") : "Sem técnico",
    value: r.count,
    hint: r.overdue ? `${r.overdue} ${plural(r.overdue, "atrasada", "atrasadas")}` : undefined,
  }));
  return (
    <Panel
      title="OMs em aberto por técnico"
      description={total ? `${total} ${plural(total, "OM ativa", "OMs ativas")} na carteira` : "Nenhuma OM ativa"}
    >
      {items.length ? (
        <BarList items={items} format="integer" />
      ) : (
        <p className="text-sm text-steel">
          Nenhuma OM em aberto.{" "}
          <Link href="/admin/oms/nova" className="text-frost hover:underline">
            Abrir uma OM
          </Link>
        </p>
      )}
    </Panel>
  );
}
