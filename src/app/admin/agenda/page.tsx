import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/system/page-header";
import { Button } from "@/components/ui/button";
import { addDays, startOfWeek, todayISO, weekday } from "@/lib/dates";
import { parseISODate } from "@/lib/format";
import { param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { getSettings } from "@/server/settings";
import { DispatchBoard } from "./_components/dispatch-board";
import { loadBoard } from "./_lib/queries";

export const metadata: Metadata = { title: "Quadro de despacho" };

const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const wd = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const dm = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" });

function dayInfo(date: string) {
  const d = parseISODate(date);
  return { date, weekday: wd.format(d).replace(".", ""), label: dm.format(d) };
}

function rangeLabel(start: string, end: string) {
  const a = parseISODate(start);
  const b = parseISODate(end);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const year = end.slice(0, 4);
  return sameMonth
    ? `${a.getUTCDate()} a ${dayMonth.format(b)} de ${year}`
    : `${dayMonth.format(a)} a ${dayMonth.format(b)} de ${year}`;
}

export default async function AgendaPage({ searchParams }: PageProps<"/admin/agenda">) {
  const sp = await searchParams;
  const today = todayISO();
  const dia = param(sp, "dia");
  const semana = param(sp, "semana");
  const mode: "semana" | "dia" = isDate(dia) ? "dia" : "semana";

  const settings = await getSettings();
  let start: string;
  let end: string;
  if (mode === "dia") {
    start = end = dia!;
  } else {
    start = startOfWeek(isDate(semana) ? semana : today);
    end = addDays(start, 6);
  }

  const { technicians, items } = await loadBoard({ start, end, today });

  let days = [dayInfo(start)];
  if (mode === "semana") {
    const all = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const used = new Set(items.map((i) => i.scheduledDate));
    days = all
      .filter((d) => {
        const w = weekday(d);
        if (w >= 1 && w <= 5) return true;
        if (w === 6) return settings.worksSaturday || used.has(d);
        return used.has(d);
      })
      .map(dayInfo);
  }

  const prevHref = mode === "dia" ? `/admin/agenda?dia=${addDays(start, -1)}` : `/admin/agenda?semana=${addDays(start, -7)}`;
  const nextHref = mode === "dia" ? `/admin/agenda?dia=${addDays(start, 1)}` : `/admin/agenda?semana=${addDays(start, 7)}`;
  const todayHref = mode === "dia" ? `/admin/agenda?dia=${today}` : "/admin/agenda";
  const isCurrent = mode === "dia" ? start === today : start === startOfWeek(today);
  const title = mode === "dia" ? longDay.format(parseISODate(start)) : rangeLabel(start, end);

  return (
    <>
      <PageHeader
        title="Quadro de despacho"
        description="Arraste as OMs entre técnicos e dias para atribuir ou reagendar. O técnico recebe o aviso na hora."
        actions={
          <Button variant="outline" asChild className="h-9">
            <Link href="/admin/oms?status=sem-tecnico">
              <ListChecks className="size-4" />
              Lista de OMs
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg ring-1 ring-rime">
            <Link href={prevHref} aria-label={mode === "dia" ? "Dia anterior" : "Semana anterior"} className="grid size-9 place-items-center rounded-l-lg text-steel hover:bg-ice/10 hover:text-frost">
              <ChevronLeft className="size-4" />
            </Link>
            <Link
              href={todayHref}
              className={cn("h-9 border-x border-rime px-3 text-sm leading-9 hover:bg-ice/10", isCurrent ? "text-steel" : "text-silver")}
            >
              Hoje
            </Link>
            <Link href={nextHref} aria-label={mode === "dia" ? "Próximo dia" : "Próxima semana"} className="grid size-9 place-items-center rounded-r-lg text-steel hover:bg-ice/10 hover:text-frost">
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <h2 className="text-base font-semibold text-silver first-letter:uppercase">{title}</h2>
        </div>
        <div className="flex rounded-lg bg-night/60 p-1 ring-1 ring-rime" role="tablist" aria-label="Visualização">
          <Link
            role="tab"
            aria-selected={mode === "semana"}
            href={`/admin/agenda?semana=${startOfWeek(start)}`}
            className={cn("rounded-md px-3 py-1 text-sm", mode === "semana" ? "bg-ice/15 text-silver ring-1 ring-ice/30" : "text-steel hover:text-silver")}
          >
            Semana
          </Link>
          <Link
            role="tab"
            aria-selected={mode === "dia"}
            href={`/admin/agenda?dia=${mode === "dia" ? start : start <= today && today <= end ? today : start}`}
            className={cn("rounded-md px-3 py-1 text-sm", mode === "dia" ? "bg-ice/15 text-silver ring-1 ring-ice/30" : "text-steel hover:text-silver")}
          >
            Dia
          </Link>
        </div>
      </div>

      <DispatchBoard mode={mode} days={days} today={today} technicians={technicians} items={items} />

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel">
        <span>Barra lateral do cartão: tipo da OM (escrito no canto do cartão).</span>
        <span>Cadeado: OM em campo ou concluída, não pode ser movida.</span>
        <span>Faixa listrada: técnico ausente.</span>
      </p>
    </>
  );
}
