import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { AnimatedNumber } from "@/components/brand/animated-number";
import { EmptyState } from "@/components/system/empty-state";
import { Button } from "@/components/ui/button";
import { requireTechnician } from "@/lib/auth/session";
import { addDays, todayISO } from "@/lib/dates";
import { formatLongDate } from "@/lib/format";
import { capitalize, firstName, greeting, groupConsecutiveBySite } from "./_lib/board";
import { countOn, monthSummary, todayBoard } from "./_lib/queries";
import { TicketList } from "./_components/om-ticket";
import { WarmOfflineCache } from "@/components/pwa/warm-cache";

export const metadata: Metadata = { title: "Hoje" };

export default async function TechTodayPage() {
  const { technician } = await requireTechnician();
  const today = todayISO();
  const [rows, month, tomorrow] = await Promise.all([
    todayBoard(technician.id, today),
    monthSummary(technician.id, today),
    countOn(technician.id, addDays(today, 1)),
  ]);

  const open = rows.filter((r) => r.status !== "concluida");
  const concluded = rows.filter((r) => r.status === "concluida");
  const overdue = open.filter((r) => r.scheduledDate != null && r.scheduledDate < today).length;
  const todayTotal = rows.filter((r) => r.scheduledDate === today).length;

  return (
    <div className="space-y-6">
      <WarmOfflineCache urls={open.map((r) => `/tecnico/om/${r.id}`)} />
      <header>
        <p className="text-sm text-steel">{capitalize(formatLongDate(today))}</p>
        <h1 className="font-display text-silver-brushed mt-1 text-[1.7rem] font-semibold leading-tight">
          {greeting()}, {firstName(technician.name)}
        </h1>
        <p className="mt-1.5 text-[0.95rem] text-steel">
          {open.length === 0 && concluded.length > 0
            ? "Tudo concluído por hoje. Bom trabalho."
            : open.length === 0
              ? "Sua agenda de hoje está livre."
              : `${open.length === 1 ? "1 OM" : `${open.length} OMs`} para atender${concluded.length ? `, ${concluded.length} já ${concluded.length === 1 ? "concluída" : "concluídas"}` : ""}.`}
        </p>
      </header>

      <Link
        href="/tecnico/ganhos"
        className="glass frost-edge grid grid-cols-[1fr_1fr_auto] items-center rounded-2xl transition-colors active:bg-ice/5"
        aria-label="Meu mês: ver ganhos"
      >
        <div className="px-4 py-3.5">
          <p className="text-xs text-steel">Concluídas no mês</p>
          <AnimatedNumber value={month.concluded} format="integer" className="readout mt-0.5 block text-xl font-semibold text-silver" />
        </div>
        <div className="border-l border-rime px-4 py-3.5">
          <p className="text-xs text-steel">Comissão do mês</p>
          <AnimatedNumber value={month.commission} format="brl" className="readout mt-0.5 block text-xl font-semibold text-mint" />
        </div>
        <ChevronRight className="mr-3 size-5 text-steel" />
      </Link>

      <section aria-labelledby="hoje-oms" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="hoje-oms" className="text-base font-semibold text-silver">
            OMs de hoje
          </h2>
          {overdue > 0 && (
            <span className="text-sm font-medium text-gauge-red">
              {overdue === 1 ? "1 atrasada" : `${overdue} atrasadas`}
            </span>
          )}
        </div>
        {open.length === 0 && concluded.length === 0 ? (
          <div className="panel">
            <EmptyState
              title="Nenhuma OM para hoje"
              description={
                tomorrow
                  ? `Amanhã você tem ${tomorrow === 1 ? "1 OM" : `${tomorrow} OMs`}. Veja os próximos dias na agenda.`
                  : "Quando o escritório agendar uma OM para você, ela aparece aqui."
              }
              action={
                <Button asChild size="lg" variant="outline" className="h-11 px-4">
                  <Link href="/tecnico/agenda">
                    <CalendarDays className="size-4" />
                    Ver agenda
                  </Link>
                </Button>
              }
            />
          </div>
        ) : (
          open.length > 0 && <TicketList groups={groupConsecutiveBySite(open)} today={today} />
        )}
      </section>

      {concluded.length > 0 && (
        <section aria-labelledby="hoje-concluidas" className="space-y-3">
          <h2 id="hoje-concluidas" className="text-sm font-medium text-steel">
            Concluídas hoje
          </h2>
          <TicketList groups={groupConsecutiveBySite(concluded)} today={today} />
        </section>
      )}

      {(todayTotal > 0 || open.length > 0) && (
        <Link
          href="/tecnico/agenda"
          className="panel flex min-h-14 items-center gap-3 px-4 py-3 transition-colors active:bg-ice/5"
        >
          <span className="grid size-9 place-items-center rounded-full bg-violet/12 text-violet ring-1 ring-violet/30">
            <CalendarDays className="size-4" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium text-silver">Amanhã</span>
            <span className="block text-xs text-steel">
              {tomorrow ? `${tomorrow === 1 ? "1 OM agendada" : `${tomorrow} OMs agendadas`}` : "Nenhuma OM agendada"}
            </span>
          </span>
          <span className="text-sm text-ice">Agenda</span>
          <ChevronRight className="size-4 text-steel" />
        </Link>
      )}
    </div>
  );
}
