import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/system/page-header";
import { ReadoutBand, type Readout } from "@/components/system/readout-band";
import { requireStaff } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { formatBRL, formatDayMonth, formatLongDate, formatPercent } from "@/lib/format";
import { AttentionList } from "./_dashboard/attention-list";
import { FieldToday } from "./_dashboard/field-today";
import { LoadPanel, PreventivePanel, RevenuePanel } from "./_dashboard/insights";
import {
  getAttention,
  getFieldToday,
  getOpenByTechnician,
  getPreventiveByMonth,
  getReadouts,
  getRevenueByMonth,
  getRoutineStatus,
  type Readouts,
} from "./_dashboard/queries";
import { RoutineStrip } from "./_dashboard/routine-strip";
import { capitalize, firstName, greeting, nowMinutes, plural } from "./_dashboard/util";

export const metadata: Metadata = { title: "Painel" };

function readouts(r: Readouts): Readout[] {
  return [
    {
      label: "Receita recorrente",
      value: r.mrr,
      format: "brl",
      hint: r.activeContracts ? `Ticket médio ${formatBRL(r.avgTicket)}` : "Nenhum contrato ativo",
      href: "/admin/contratos",
    },
    {
      label: "Contratos ativos",
      value: r.activeContracts,
      hint: `${r.coveredEquipment} ${plural(r.coveredEquipment, "aparelho coberto", "aparelhos cobertos")}`,
      href: "/admin/contratos",
    },
    {
      label: "OMs hoje",
      value: r.todayCount,
      hint: r.todayCount ? `${r.todayDone} ${plural(r.todayDone, "concluída", "concluídas")}` : "Agenda livre",
      href: "/admin/agenda",
    },
    {
      label: "OMs atrasadas",
      value: r.overdueOrders,
      tone: r.overdueOrders > 0 ? "red" : undefined,
      hint: r.oldestOverdue ? `A mais antiga de ${formatDayMonth(r.oldestOverdue)}` : "Nenhuma fora do prazo",
      href: "/admin/oms?filtro=atrasadas",
    },
    {
      label: "Inadimplência",
      value: r.overdueAmount,
      format: "brl",
      tone: r.overdueAmount <= 0 ? undefined : r.overdueRatio >= 0.1 ? "red" : "brass",
      hint:
        r.overdueAmount > 0
          ? `${formatPercent(r.overdueRatio)} da receita do mês`
          : "Nenhum título vencido",
      href: "/admin/financeiro/receber?status=vencido",
    },
    {
      label: "A receber em 30 dias",
      value: r.next30,
      format: "brl",
      hint: `${r.next30Count} ${plural(r.next30Count, "título", "títulos")} em aberto`,
      href: "/admin/financeiro/receber",
    },
  ];
}

export default async function AdminDashboardPage() {
  const user = await requireStaff();
  const today = todayISO();
  const now = nowMinutes();

  const [summary, attention, field, revenue, preventive, load, routine] = await Promise.all([
    getReadouts(today),
    getAttention(today),
    getFieldToday(today),
    getRevenueByMonth(today),
    getPreventiveByMonth(today),
    getOpenByTechnician(today),
    getRoutineStatus(),
  ]);

  const name = firstName(user.name);

  return (
    <>
      <PageHeader
        title={name ? `${greeting(now)}, ${name}` : greeting(now)}
        description={capitalize(formatLongDate(today))}
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href="/admin/agenda">
                <CalendarRange />
                Agenda
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link href="/admin/oms/nova">
                <Plus />
                Nova OM
              </Link>
            </Button>
          </>
        }
      />

      <ReadoutBand
        items={readouts(summary)}
        className={[
          // Até ~1400px (87,5rem): duas linhas de três; acima disso, uma faixa única de seis leituras.
          "md:grid-flow-row md:grid-cols-3 md:[&>*:nth-child(n+4)]:border-t md:[&>*:nth-child(4)]:border-l-0",
          "min-[87.5rem]:grid-flow-col min-[87.5rem]:grid-cols-none min-[87.5rem]:[&>*:nth-child(n+4)]:border-t-0",
          "min-[87.5rem]:[&>*:nth-child(4)]:border-l min-[87.5rem]:[&_.readout]:text-[1.4rem]",
        ].join(" ")}
      />

      {/*
        No celular a ordem é: atenção, campo, gráficos, carteira e rotina.
        A partir de xl, duas colunas (2/3 operação, 1/3 pendências) — os wrappers viram colunas.
      */}
      <div className="mt-6 flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <div className="contents xl:flex xl:flex-col xl:gap-6">
          <div className="order-2 xl:order-none">
            <FieldToday data={field} now={now} today={today} />
          </div>
          <div className="order-3 grid gap-6 md:grid-cols-2 xl:order-none">
            <RevenuePanel data={revenue} />
            <PreventivePanel data={preventive} />
          </div>
        </div>
        <div className="contents xl:flex xl:flex-col xl:gap-6">
          <div className="order-1 xl:order-none">
            <AttentionList data={attention} today={today} />
          </div>
          <div className="order-4 xl:order-none">
            <LoadPanel data={load} />
          </div>
          <div className="order-5 xl:order-none">
            <RoutineStrip data={routine} today={today} />
          </div>
        </div>
      </div>
    </>
  );
}
