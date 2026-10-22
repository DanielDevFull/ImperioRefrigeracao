import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck2 } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { PageHeader } from "@/components/system/page-header";
import { toneOnTint } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { requireTechnician } from "@/lib/auth/session";
import { addDays, todayISO, weekday } from "@/lib/dates";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { capitalize, groupConsecutiveBySite } from "../_lib/board";
import { agendaBoard, type TicketRow } from "../_lib/queries";
import { TicketList } from "../_components/om-ticket";

export const metadata: Metadata = { title: "Agenda" };

const DAYS = 14;
const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function dayTitle(date: string, today: string) {
  if (date === today) return "Hoje";
  if (date === addDays(today, 1)) return "Amanhã";
  return capitalize(formatLongDate(date));
}

export default async function TechAgendaPage() {
  const { technician } = await requireTechnician();
  const today = todayISO();
  const last = addDays(today, DAYS - 1);
  const { dated, undated } = await agendaBoard(technician.id, today, last);

  const byDay = new Map<string, TicketRow[]>();
  for (const r of dated) {
    const k = r.scheduledDate!;
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const activeCount = (rows: TicketRow[] | undefined) => (rows ?? []).filter((r) => r.status !== "concluida").length;
  const total = dated.filter((r) => r.status !== "concluida").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        description={
          total
            ? `${total === 1 ? "1 OM" : `${total} OMs`} nos próximos ${DAYS} dias.`
            : `Nenhuma OM pendente nos próximos ${DAYS} dias.`
        }
      />

      <nav aria-label="Dias" className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const n = activeCount(byDay.get(d));
          const isToday = d === today;
          const content = (
            <>
              <span className="text-[0.68rem] text-steel">{WEEKDAY_SHORT[weekday(d)]}</span>
              <span className={cn("readout text-base font-semibold", isToday ? toneOnTint.ice : n ? "text-silver" : "text-silver light:text-steel")}>
                {Number(d.slice(8, 10))}
              </span>
              <span
                className={cn(
                  "readout grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.65rem] font-semibold",
                  n ? "bg-ice text-abyss" : "text-steel/50",
                )}
              >
                {n || "·"}
              </span>
            </>
          );
          const cls = cn(
            "flex min-h-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-xl ring-1",
            isToday ? "bg-ice/10 ring-ice/35" : "bg-night/50 ring-rime light:bg-night light:shadow-[0_1px_2px_var(--shade)]",
            n && "active:bg-ice/10",
          );
          return n ? (
            <a key={d} href={`#dia-${d}`} className={cls} aria-label={`${dayTitle(d, today)}: ${n} OMs`}>
              {content}
            </a>
          ) : (
            // dia livre: esmaecido no escuro; no claro a opacidade derruba o texto abaixo de 4,5:1, então o "livre"
            // vem de fundo vazado e número em steel
            <span key={d} className={cn(cls, "opacity-60 light:opacity-100", !isToday && "light:bg-transparent light:shadow-none")} aria-label={`${dayTitle(d, today)}: livre`}>
              {content}
            </span>
          );
        })}
      </nav>

      {dated.length === 0 && undated.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<CalendarCheck2 className="size-6 text-frost" />}
            title="Agenda livre"
            description="Nenhuma OM atribuída a você nas próximas duas semanas. Quando o escritório agendar, ela aparece aqui e você recebe uma notificação."
            action={
              <Button asChild size="lg" variant="outline" className="h-11 px-4">
                <Link href="/tecnico">Voltar para Hoje</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-7">
          {days
            .filter((d) => byDay.has(d))
            .map((d) => {
              const rows = byDay.get(d)!;
              const pending = activeCount(rows);
              return (
                <section key={d} id={`dia-${d}`} aria-labelledby={`dia-${d}-t`} className="scroll-mt-20 space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 id={`dia-${d}-t`} className="text-base font-semibold text-silver">
                      {dayTitle(d, today)}
                      {d === today || d === addDays(today, 1) ? (
                        <span className="ml-2 text-sm font-normal text-steel">{formatLongDate(d).split(",")[1]?.trim()}</span>
                      ) : null}
                    </h2>
                    <span className="readout shrink-0 text-sm text-steel">
                      {pending === rows.length ? (pending === 1 ? "1 OM" : `${pending} OMs`) : `${pending} de ${rows.length} pendentes`}
                    </span>
                  </div>
                  <TicketList groups={groupConsecutiveBySite(rows)} today={today} />
                </section>
              );
            })}
          {undated.length > 0 && (
            <section aria-labelledby="sem-data" className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 id="sem-data" className="text-base font-semibold text-silver">
                  Sem data marcada
                </h2>
                <span className="text-sm text-steel">{undated.length === 1 ? "1 OM" : `${undated.length} OMs`}</span>
              </div>
              <TicketList groups={groupConsecutiveBySite(undated)} today={today} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
