import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/system/empty-state";
import { Panel } from "@/components/system/panel";
import { WorkOrderStatusBadge } from "@/components/system/status";
import { formatOM } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FieldOrder, FieldToday as FieldData } from "./queries";
import { hhmm, plural, stampMinutes, toMinutes } from "./util";

const MAX_STOPS = 8;
const NOT_STARTED = new Set(["aberta", "agendada", "aguardando_material"]);

type Lane = {
  key: string;
  name: string;
  color: string | null;
  absent: string | null;
  orders: FieldOrder[];
};

type Range = { start: number; end: number };

const pct = (m: number, r: Range) => `${((Math.min(Math.max(m, r.start), r.end) - r.start) / (r.end - r.start)) * 100}%`;

/** Equipamento da OM ("Split hi-wall — Sala 1"); sem equipamento, o título. */
function equipmentPart(o: { title: string; equipmentType: string | null; equipmentLocation: string | null }) {
  const label = [o.equipmentType, o.equipmentLocation].filter(Boolean).join(" — ");
  return label || o.title;
}

function isLate(o: FieldOrder, now: number) {
  const t = toMinutes(o.time);
  return t != null && NOT_STARTED.has(o.status) && t < now - 15;
}

function laneState(lane: Lane, now: number) {
  if (lane.absent && !lane.orders.length) return lane.absent;
  const byStatus = (s: string) => lane.orders.find((o) => o.status === s);
  const running = byStatus("em_execucao");
  if (running) {
    const since = running.startedAt ? running.startedAt.slice(11, 16) : null;
    return `Em execução em ${running.customer}${since ? ` desde ${since}` : ""}`;
  }
  const travelling = byStatus("em_deslocamento");
  if (travelling) return `A caminho de ${travelling.customer}`;
  const paused = byStatus("pausada");
  if (paused) return `Pausado em ${paused.customer}`;
  const pending = lane.orders.filter((o) => o.status !== "concluida");
  if (!pending.length) return "Dia concluído";
  const next = pending.find((o) => o.time) ?? pending[0];
  if (!next.time) return `${pending.length} ${plural(pending.length, "OM a fazer", "OMs a fazer")}`;
  if (isLate(next, now)) return `${next.customer} era às ${next.time} e não começou`;
  return `Próxima às ${next.time} em ${next.customer}`;
}

function DayTrack({ orders, range, now, today }: { orders: FieldOrder[]; range: Range; now: number; today: string }) {
  const hours: number[] = [];
  for (let h = Math.ceil(range.start / 60); h * 60 <= range.end; h++) hours.push(h * 60);
  const showNow = now >= range.start && now <= range.end;
  return (
    <div className="relative mt-3 h-4" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-ice/8">
        {hours.map((m) => (
          <span key={m} className="absolute inset-y-0 w-px bg-abyss/70 light:bg-night" style={{ left: pct(m, range) }} />
        ))}
      </div>
      {orders.map((o) => {
        const sched = toMinutes(o.time);
        const started = stampMinutes(o.startedAt, today);
        const finished = stampMinutes(o.finishedAt, today);
        const travel = stampMinutes(o.travelAt, today);
        const label = `${o.time ?? "Sem horário"} ${o.customer}`;
        if (o.status === "concluida") {
          if (started != null && finished != null && finished > started) {
            return (
              <span
                key={o.id}
                title={`${label}: concluída das ${hhmm(started)} às ${hhmm(finished)}`}
                className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-mint/75"
                style={{ left: pct(started, range), width: `calc(${pct(finished, range)} - ${pct(started, range)})` }}
              />
            );
          }
          const at = finished ?? sched;
          if (at == null) return null;
          return (
            <span
              key={o.id}
              title={`${label}: concluída`}
              className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mint ring-2 ring-night"
              style={{ left: pct(at, range) }}
            />
          );
        }
        if (o.status === "em_execucao" || o.status === "pausada" || o.status === "em_deslocamento") {
          const from = o.status === "em_deslocamento" ? (travel ?? now) : (started ?? travel ?? sched ?? now);
          const live = o.status !== "pausada";
          return (
            <span key={o.id} title={`${label}: em andamento`}>
              <span
                className={cn(
                  "absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full",
                  o.status === "pausada" ? "bg-brass/60" : o.status === "em_deslocamento" ? "bg-ice/45" : "bg-ice/80",
                  live && "animate-breathe",
                )}
                style={{ left: pct(from, range), width: `calc(${pct(Math.max(now, from + 5), range)} - ${pct(from, range)})` }}
              />
              <span
                className={cn(
                  "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-night",
                  o.status === "pausada" ? "bg-brass" : "bg-ice shadow-[0_0_10px_var(--glow-ice)]",
                )}
                style={{ left: pct(Math.max(now, from), range) }}
              />
            </span>
          );
        }
        if (sched == null) return null;
        const late = isLate(o, now);
        return (
          <span key={o.id} title={`${label}: ${late ? "horário passou sem início" : "agendada"}`}>
            <span
              className={cn("absolute top-1/2 h-1.5 -translate-y-1/2 rounded-r-full", late ? "bg-brass/20" : "bg-violet/25")}
              style={{ left: pct(sched, range), width: `calc(${pct(sched + (o.minutes ?? 60), range)} - ${pct(sched, range)})` }}
            />
            <span
              className={cn(
                "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-night",
                late ? "bg-brass" : "bg-violet",
              )}
              style={{ left: pct(sched, range) }}
            />
          </span>
        );
      })}
      {showNow && (
        <span className="absolute -inset-y-1 w-px bg-frost/80" style={{ left: pct(now, range) }} />
      )}
    </div>
  );
}

function Scale({ range, now }: { range: Range; now: number }) {
  const step = range.end - range.start > 14 * 60 ? 3 : 2;
  const marks: number[] = [];
  for (let h = Math.ceil(range.start / 60); h * 60 <= range.end; h++) if (h % step === 0) marks.push(h * 60);
  const showNow = now >= range.start && now <= range.end;
  const nowPos = ((now - range.start) / (range.end - range.start)) * 100;
  return (
    <div className="relative mx-5 mt-4 h-5 text-[0.7rem] text-steel/70 light:text-steel/85" aria-hidden>
      {marks.map((m, i) => {
        const pos = ((m - range.start) / (range.end - range.start)) * 100;
        if (showNow && Math.abs(pos - nowPos) < 6) return null;
        return (
          <span
            key={m}
            className={cn(
              "absolute top-0 -translate-x-1/2 tabular-nums",
              pos < 3 && "translate-x-0",
              pos > 97 && "-translate-x-full",
              i % 2 === 1 && "max-sm:hidden",
            )}
            style={{ left: `${pos}%` }}
          >
            {String(m / 60).padStart(2, "0")}h
          </span>
        );
      })}
      {showNow && (
        <span
          className={cn(
            "absolute -top-0.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-frost/12 px-1.5 py-px font-medium text-frost tabular-nums ring-1 ring-frost/25",
            nowPos > 92 && "-translate-x-full",
            nowPos < 8 && "translate-x-0",
          )}
          style={{ left: `${nowPos}%` }}
        >
          Agora {hhmm(now)}
        </span>
      )}
    </div>
  );
}

function LaneRow({ lane, range, now, today }: { lane: Lane; range: Range; now: number; today: string }) {
  const total = lane.orders.length;
  const done = lane.orders.filter((o) => o.status === "concluida").length;
  const shown = lane.orders.slice(0, MAX_STOPS);
  const hidden = total - shown.length;
  return (
    <li className="@container px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="order-1 flex min-w-0 items-center gap-2.5">
          <span
            className={cn("size-2.5 shrink-0 rounded-full", !lane.color && "bg-steel/60 ring-1 ring-steel/40")}
            style={lane.color ? { background: lane.color, boxShadow: `0 0 0 3px ${lane.color}26` } : undefined}
          />
          <span className="truncate text-sm font-medium text-silver">{lane.name}</span>
        </span>
        <span className="order-3 min-w-0 basis-full truncate text-xs text-steel @xl:order-2 @xl:flex-1 @xl:basis-auto">
          {laneState(lane, now)}
        </span>
        <span className="order-2 ml-auto flex shrink-0 items-center gap-2 text-xs text-steel @xl:order-3">
          <span>
            <span className="tabular-nums text-silver">{done}</span> de <span className="tabular-nums">{total}</span>{" "}
            {plural(total, "concluída", "concluídas")}
          </span>
          <span className="hidden h-1 w-14 overflow-hidden rounded-full bg-ice/8 @sm:block">
            <span className="block h-full rounded-full bg-mint" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </span>
        </span>
      </div>

      <DayTrack orders={lane.orders} range={range} now={now} today={today} />

      <ol className="@container -mx-2 mt-2.5">
        {shown.map((o) => {
          const late = isLate(o, now);
          const live = o.status === "em_execucao" || o.status === "em_deslocamento";
          return (
            <li key={o.id}>
              <Link
                href={`/admin/oms/${o.id}`}
                className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-ice/5 @md:grid-cols-[3rem_minmax(0,10rem)_minmax(0,1fr)_auto] @2xl:grid-cols-[3rem_minmax(0,13rem)_minmax(0,1fr)_auto]"
              >
                <span
                  className={cn(
                    "readout text-sm",
                    late ? "text-brass" : live ? "text-ice" : o.status === "concluida" ? "text-steel" : "text-silver",
                  )}
                  title={late ? "O horário passou e a OM não começou" : o.time ? undefined : "Sem horário definido"}
                >
                  {o.time ?? "—"}
                </span>
                <span className="truncate text-sm text-silver">{o.customer}</span>
                <span className="hidden truncate text-xs text-steel @md:block">
                  <span className="mr-2.5 hidden tabular-nums text-steel/60 light:text-steel/85 @2xl:inline">{formatOM(o.number)}</span>
                  {equipmentPart(o)}
                </span>
                <span className="justify-self-end">
                  <WorkOrderStatusBadge status={o.status} />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      {hidden > 0 && (
        <Link href="/admin/agenda" className="mt-1 inline-block px-0 text-xs text-steel hover:text-frost">
          Ver mais {hidden} na agenda
        </Link>
      )}
    </li>
  );
}

export function FieldToday({ data, now, today }: { data: FieldData; now: number; today: string }) {
  const { techs, absences, orders } = data;
  const absentBy = new Map(absences.map((a) => [a.technicianId, a.reason ? `Ausente hoje (${a.reason.toLowerCase()})` : "Ausente hoje"]));

  const lanes: Lane[] = techs.map((t) => ({
    key: t.id,
    name: t.name,
    color: t.color,
    absent: absentBy.get(t.id) ?? null,
    orders: orders.filter((o) => o.technicianId === t.id),
  }));
  // OMs de técnicos inativos ficam na própria faixa; as sem técnico, numa faixa neutra.
  const known = new Set(techs.map((t) => t.id));
  const orphan = orders.filter((o) => o.technicianId && !known.has(o.technicianId));
  if (orphan.length) lanes.push({ key: "inativos", name: "Técnicos inativos", color: null, absent: null, orders: orphan });
  const unassigned = orders.filter((o) => !o.technicianId);
  if (unassigned.length) lanes.push({ key: "sem", name: "Sem técnico", color: null, absent: null, orders: unassigned });

  const rank = (l: Lane) =>
    l.key === "sem" ? -1 : l.orders.some((o) => o.status === "em_execucao" || o.status === "em_deslocamento") ? 0 : 1;
  const busy = lanes
    .filter((l) => l.orders.length)
    .sort((a, b) => rank(a) - rank(b) || b.orders.length - a.orders.length || a.name.localeCompare(b.name, "pt-BR"));
  const idle = lanes.filter((l) => !l.orders.length);

  // Escala comum a todos os técnicos, para comparar o dia de cada um.
  const points: number[] = [];
  for (const o of orders) {
    const t = toMinutes(o.time);
    if (t != null) points.push(t, t + (o.minutes ?? 60));
    for (const s of [o.travelAt, o.startedAt, o.finishedAt]) {
      const m = stampMinutes(s, today);
      if (m) points.push(m);
    }
  }
  if (now >= 5 * 60 && now <= 23 * 60) points.push(now);
  const range: Range = {
    start: Math.min(7 * 60, Math.floor(Math.min(...points, 7 * 60) / 60) * 60),
    end: Math.max(19 * 60, Math.ceil(Math.max(...points, 19 * 60) / 60) * 60),
  };

  const done = orders.filter((o) => o.status === "concluida").length;
  const inField = orders.filter((o) => o.status === "em_execucao" || o.status === "em_deslocamento").length;
  const people = busy.filter((l) => l.key !== "sem").length;

  return (
    <Panel
      title="Hoje em campo"
      description={
        orders.length
          ? [
              `${orders.length} ${plural(orders.length, "OM", "OMs")} com ${people} ${plural(people, "técnico", "técnicos")}`,
              inField ? `${inField} em andamento agora` : null,
              done ? `${done} ${plural(done, "concluída", "concluídas")}` : null,
            ]
              .filter(Boolean)
              .join(", ")
          : "Nenhuma OM agendada para hoje"
      }
      actions={
        <Button asChild variant="ghost" size="sm" className="text-steel hover:text-frost">
          <Link href="/admin/agenda">
            <CalendarRange />
            Abrir agenda
          </Link>
        </Button>
      }
      flush
    >
      {orders.length === 0 ? (
        <EmptyState
          title="Ninguém em campo hoje"
          description="Não há OMs agendadas para hoje. Veja a semana na agenda ou abra uma OM para encaixar um atendimento."
          action={
            <Button asChild size="sm">
              <Link href="/admin/oms/nova">Abrir nova OM</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Scale range={range} now={now} />
          <ul className="divide-y divide-rime">
            {busy.map((lane) => (
              <LaneRow key={lane.key} lane={lane} range={range} now={now} today={today} />
            ))}
          </ul>
        </>
      )}
      {idle.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rime px-5 py-3 text-xs text-steel">
          <span>Sem OMs hoje</span>
          {idle.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5 text-silver/90">
              <span className="size-2 rounded-full" style={{ background: l.color ?? undefined }} />
              {l.name}
              {l.absent && <span className="text-steel">{l.absent.replace("Ausente hoje", "").trim() || "(ausente)"}</span>}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}
