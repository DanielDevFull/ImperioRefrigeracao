"use client";

import Link from "next/link";
import { startTransition, useMemo, useOptimistic, useState } from "react";
import { LayoutGroup } from "motion/react";
import { Inbox, Palmtree } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatOM } from "@/lib/format";
import { cn } from "@/lib/utils";
import { moveOmAction } from "../actions";
import {
  DAY_END,
  DAY_START,
  LOCKED,
  absenceOn,
  formatHours,
  hhmm,
  isLate,
  minutesOf,
  needsDispatch,
  type BoardItem,
  type BoardTechnician,
} from "../_lib/board";
import { DRAG_TYPE, OmChip } from "./om-chip";
import { MoveDialog, type MoveTarget } from "./move-dialog";
import { useNow } from "./use-now";

type Day = { date: string; weekday: string; label: string };

type Move = { id: string } & MoveTarget;

function applyMove(items: BoardItem[], m: Move) {
  return items.map((i) => {
    if (i.id !== m.id) return i;
    const status =
      i.status === "aberta" || i.status === "agendada" ? (m.technicianId && m.date ? "agendada" : "aberta") : i.status;
    return {
      ...i,
      technicianId: m.technicianId,
      scheduledDate: m.date,
      scheduledTime: m.time === undefined ? i.scheduledTime : m.time,
      status,
    };
  });
}

const PRIORITY_RANK: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };

function byTime(a: BoardItem, b: BoardItem) {
  const ta = a.scheduledTime ?? "99:99";
  const tb = b.scheduledTime ?? "99:99";
  return ta.localeCompare(tb) || a.number - b.number;
}

const hatch = {
  backgroundImage: "repeating-linear-gradient(135deg, rgb(232 176 75 / 0.13) 0 6px, transparent 6px 13px)",
};

function useDropZone(onDropId: (id: string, e: React.DragEvent<HTMLElement>) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      },
      onDragLeave: (e: React.DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: React.DragEvent<HTMLElement>) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (id) onDropId(id, e);
      },
    },
  };
}

function Cell({
  tech,
  day,
  items,
  isToday,
  nowMinutes,
  nowLabel,
  dragging,
  setDragging,
  onOpen,
  onDrop,
  today,
}: {
  tech: BoardTechnician;
  day: Day;
  items: BoardItem[];
  isToday: boolean;
  nowMinutes: number | null;
  nowLabel: string | null;
  dragging: string | null;
  setDragging: (id: string | null) => void;
  onOpen: (id: string) => void;
  onDrop: (id: string, target: MoveTarget) => void;
  today: string;
}) {
  const absence = absenceOn(tech, day.date);
  const zone = useDropZone((id) => onDrop(id, { technicianId: tech.id, date: day.date }));
  const minutes = items.filter((i) => i.status !== "cancelada").reduce((s, i) => s + i.minutes, 0);
  // Linha "agora": antes do primeiro atendimento com horário depois de agora
  const nowIndex =
    isToday && nowMinutes != null
      ? (() => {
          const idx = items.findIndex((i) => (minutesOf(i.scheduledTime) ?? 24 * 60) > nowMinutes);
          return idx === -1 ? items.length : idx;
        })()
      : -1;

  return (
    <div
      {...zone.props}
      aria-label={`${tech.name}, ${day.weekday} ${day.label}`}
      className={cn(
        "relative flex min-h-28 min-w-0 flex-1 flex-col gap-1.5 border-l border-rime p-1.5 transition-colors",
        isToday && "bg-ice/[0.035]",
        zone.over && (absence ? "bg-brass/10 ring-2 ring-inset ring-brass/50" : "bg-ice/10 ring-2 ring-inset ring-ice/60"),
      )}
      style={absence ? hatch : undefined}
    >
      {absence && (
        <span className="inline-flex items-center gap-1 self-start rounded bg-abyss/70 px-1.5 py-0.5 text-[0.68rem] font-medium text-brass ring-1 ring-brass/30">
          <Palmtree className="size-3" />
          {absence.reason ?? "Ausente"}
        </span>
      )}
      {items.map((i, idx) => (
        <div key={i.id} className="contents">
          {idx === nowIndex && <NowLine label={nowLabel} />}
          <OmChip item={i} late={isLate(i, today)} dragging={dragging === i.id} onDragState={setDragging} onOpen={onOpen} />
        </div>
      ))}
      {nowIndex === items.length && items.length > 0 && <NowLine label={nowLabel} />}
      {minutes > 0 && <span className="readout mt-auto self-end text-[0.65rem] text-steel/80">{formatHours(minutes)}</span>}
    </div>
  );
}

function NowLine({ label }: { label: string | null }) {
  return (
    <div className="relative flex items-center gap-1" aria-label={`Agora, ${label}`}>
      <span className="size-1.5 rounded-full bg-gauge-red shadow-[0_0_6px_var(--gauge-red)]" />
      <span className="h-px flex-1 bg-gauge-red/80" />
      <span className="readout text-[0.62rem] font-semibold text-gauge-red">agora {label}</span>
    </div>
  );
}

/* --------------------------------- Dia --------------------------------- */

function lanes(items: BoardItem[]) {
  const span = DAY_END - DAY_START;
  const minVisual = 110; // minutos mínimos ocupados por um chip (legibilidade)
  const out: { item: BoardItem; lane: number; left: number; width: number }[] = [];
  const laneEnds: number[] = [];
  for (const it of [...items].sort(byTime)) {
    const visual = Math.max(it.minutes, minVisual);
    // Encosta no fim da janela quando o atendimento termina depois das 19h
    const start = Math.max(DAY_START, Math.min(DAY_END - visual, minutesOf(it.scheduledTime) ?? DAY_START));
    const end = start + visual;
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else laneEnds[lane] = end;
    out.push({
      item: it,
      lane,
      left: ((start - DAY_START) / span) * 100,
      width: (visual / span) * 100,
    });
  }
  return { placed: out, count: Math.max(1, laneEnds.length) };
}

const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START + i * 60);

function DayRow({
  tech,
  date,
  items,
  nowMinutes,
  isToday,
  dragging,
  setDragging,
  onOpen,
  onDrop,
  today,
}: {
  tech: BoardTechnician;
  date: string;
  items: BoardItem[];
  nowMinutes: number | null;
  isToday: boolean;
  dragging: string | null;
  setDragging: (id: string | null) => void;
  onOpen: (id: string) => void;
  onDrop: (id: string, target: MoveTarget) => void;
  today: string;
}) {
  const absence = absenceOn(tech, date);
  const untimed = items.filter((i) => !i.scheduledTime);
  const timed = items.filter((i) => i.scheduledTime);
  const { placed, count } = lanes(timed);
  const LANE = 50;
  const well = useDropZone((id) => onDrop(id, { technicianId: tech.id, date, time: null }));
  const track = useDropZone((id, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const raw = DAY_START + ratio * (DAY_END - DAY_START);
    const snapped = Math.min(DAY_END - 30, Math.max(DAY_START, Math.round(raw / 30) * 30));
    onDrop(id, { technicianId: tech.id, date, time: hhmm(snapped) });
  });

  return (
    <>
      <div
        {...well.props}
        className={cn(
          "flex min-h-20 flex-col gap-1.5 border-l border-t border-rime p-1.5",
          well.over && "bg-ice/10 ring-2 ring-inset ring-ice/60",
        )}
      >
        {untimed.map((i) => (
          <OmChip compact key={i.id} item={i} late={isLate(i, today)} dragging={dragging === i.id} onDragState={setDragging} onOpen={onOpen} />
        ))}
      </div>
      <div
        {...track.props}
        className={cn("relative border-l border-t border-rime", track.over && "bg-ice/[0.07]")}
        style={{ height: Math.max(80, count * LANE + 16), ...(absence ? hatch : {}) }}
      >
        {HOURS.map((h) => (
          <span key={h} aria-hidden className="absolute inset-y-0 w-px bg-rime/60" style={{ left: `${((h - DAY_START) / (DAY_END - DAY_START)) * 100}%` }} />
        ))}
        {absence && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-abyss/70 px-1.5 py-0.5 text-[0.68rem] font-medium text-brass ring-1 ring-brass/30">
            <Palmtree className="size-3" />
            {absence.reason ?? "Ausente"}
          </span>
        )}
        {isToday && nowMinutes != null && nowMinutes >= DAY_START && nowMinutes <= DAY_END && (
          <span
            aria-hidden
            className="absolute inset-y-0 z-10 w-0.5 bg-gauge-red/90 shadow-[0_0_8px_var(--gauge-red)]"
            style={{ left: `${((nowMinutes - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}
          />
        )}
        {placed.map(({ item, lane, left, width }) => (
          <div key={item.id} className="absolute z-[1]" style={{ left: `${left}%`, width: `calc(${width}% - 4px)`, top: 8 + lane * LANE }}>
            <OmChip compact item={item} late={isLate(item, today)} dragging={dragging === item.id} onDragState={setDragging} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------- Quadro -------------------------------- */

export function DispatchBoard({
  mode,
  days,
  today,
  technicians,
  items,
}: {
  mode: "semana" | "dia";
  days: Day[];
  today: string;
  technicians: BoardTechnician[];
  items: BoardItem[];
}) {
  const [optimistic, move] = useOptimistic(items, applyMove);
  const [dragging, setDragging] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const now = useNow();
  const nowMinutes = now && now.today === today ? now.minutes : null;

  const dates = useMemo(() => new Set(days.map((d) => d.date)), [days]);
  const tray = optimistic
    .filter((i) => needsDispatch(i, today))
    .sort((a, b) => {
      const la = isLate(a, today) ? 0 : 1;
      const lb = isLate(b, today) ? 0 : 1;
      return (
        la - lb ||
        (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
        (a.scheduledDate ?? "9999").localeCompare(b.scheduledDate ?? "9999") ||
        a.number - b.number
      );
    });
  const lateCount = tray.filter((i) => isLate(i, today)).length;
  const onBoard = optimistic.filter((i) => !needsDispatch(i, today) && i.technicianId && i.scheduledDate && dates.has(i.scheduledDate) && i.status !== "cancelada");

  const drop = (id: string, target: MoveTarget, fromDialog = false) => {
    // O cartão arrastado muda de célula e o dragend pode não chegar: limpa aqui.
    setDragging(null);
    const item = optimistic.find((i) => i.id === id);
    if (!item) return;
    if (LOCKED.has(item.status)) {
      toast.error(`${formatOM(item.number)} já está em campo ou encerrada e não pode ser movida.`);
      return;
    }
    const tech = technicians.find((t) => t.id === target.technicianId);
    if (tech && target.date) {
      const abs = absenceOn(tech, target.date);
      if (abs && !fromDialog) {
        toast.error(`${tech.name} está ausente em ${formatDate(target.date)}${abs.reason ? ` (${abs.reason})` : ""}. Escolha outro técnico ou dia.`);
        return;
      }
    }
    const sameTime = target.time === undefined || (target.time ?? null) === (item.scheduledTime ?? null);
    if (item.technicianId === target.technicianId && item.scheduledDate === target.date && sameTime) return;
    if (!target.technicianId && target.time && !target.date) return;
    startTransition(async () => {
      move({ id, ...target });
      const r = await moveOmAction({ id, technicianId: target.technicianId, scheduledDate: target.date, scheduledTime: target.time });
      if (r.ok) toast.success(r.message ?? "Agenda atualizada");
      else toast.error(r.error ?? "Não foi possível mover a OM.");
    });
  };

  const trayZone = useDropZone((id) => {
    const item = optimistic.find((i) => i.id === id);
    if (!item || !item.technicianId) return;
    drop(id, { technicianId: null, date: item.scheduledDate });
  });

  const perTech = (techId: string) => {
    const list = onBoard.filter((i) => i.technicianId === techId);
    return { count: list.length, minutes: list.reduce((s, i) => s + i.minutes, 0) };
  };

  const openItem = optimistic.find((i) => i.id === openId) ?? null;

  return (
    <LayoutGroup>
      {/* Bandeja: sem técnico, sem data e atrasadas */}
      <section
        {...trayZone.props}
        aria-label="OMs sem técnico"
        className={cn("panel mb-4 transition-colors", trayZone.over && "ring-2 ring-ice/60")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rime px-4 py-3">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-brass" />
            <h2 className="text-[0.95rem] font-semibold text-silver">Sem técnico</h2>
            <span className="readout rounded-full bg-brass/12 px-2 text-xs font-semibold text-brass ring-1 ring-brass/30">{tray.length}</span>
            {lateCount > 0 && (
              <span className="readout rounded-full bg-gauge-red/12 px-2 text-xs font-semibold text-gauge-red ring-1 ring-gauge-red/35">
                {lateCount} {lateCount === 1 ? "atrasada" : "atrasadas"}
              </span>
            )}
          </div>
          <p className="text-xs text-steel">Arraste para um técnico e um dia, ou toque na OM para escolher. Solte aqui para tirar o técnico.</p>
        </div>
        {tray.length === 0 ? (
          <p className="px-4 py-4 text-sm text-steel">Tudo despachado: nenhuma OM esperando técnico ou data.</p>
        ) : (
          <div className="grid max-h-60 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2 overflow-y-auto p-3">
            {tray.map((i) => (
              <OmChip key={i.id} item={i} late={isLate(i, today)} showDate dragging={dragging === i.id} onDragState={setDragging} onOpen={setOpenId} />
            ))}
          </div>
        )}
      </section>

      {/* Quadro */}
      <div className="panel overflow-x-auto">
        {mode === "semana" ? (
          <div
            className="grid min-w-[56rem]"
            style={{ gridTemplateColumns: `11.5rem repeat(${days.length}, minmax(9.5rem, 1fr))` }}
            role="grid"
            aria-label="Quadro de despacho da semana"
          >
            <div className="sticky left-0 z-20 border-b border-rime bg-night px-3 py-2.5 text-xs text-steel">Técnico</div>
            {days.map((d) => {
              const isToday = d.date === today;
              return (
                <Link
                  key={d.date}
                  href={`/admin/agenda?dia=${d.date}`}
                  className={cn(
                    "border-b border-l border-rime px-2.5 py-2 transition-colors hover:bg-ice/5",
                    isToday && "bg-ice/[0.07]",
                  )}
                  title="Ver o dia"
                >
                  <span className={cn("block text-xs capitalize", isToday ? "text-ice" : "text-steel")}>{d.weekday}</span>
                  <span className="flex items-center gap-2">
                    <span className={cn("readout text-sm font-semibold", isToday ? "text-silver" : "text-silver/90")}>{d.label}</span>
                    {isToday && (
                      <span className="readout inline-flex items-center gap-1 rounded-full bg-gauge-red/12 px-1.5 text-[0.65rem] font-semibold text-gauge-red ring-1 ring-gauge-red/30">
                        <span className="size-1.5 animate-breathe rounded-full bg-gauge-red" />
                        Hoje{now ? `, ${now.label}` : ""}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
            {technicians.map((t) => {
              const stats = perTech(t.id);
              return (
                <div key={t.id} className="contents" role="row">
                  <div className="sticky left-0 z-10 flex flex-col justify-center gap-0.5 border-t border-rime bg-night px-3 py-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-silver">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="truncate">{t.name}</span>
                    </span>
                    <span className="readout pl-[1.125rem] text-xs text-steel">
                      {stats.count} {stats.count === 1 ? "OM" : "OMs"}, {formatHours(stats.minutes)}
                    </span>
                  </div>
                  {days.map((d) => (
                    <div key={d.date} className="flex border-t border-rime">
                      <Cell
                        tech={t}
                        day={d}
                        items={onBoard.filter((i) => i.technicianId === t.id && i.scheduledDate === d.date).sort(byTime)}
                        isToday={d.date === today}
                        nowMinutes={nowMinutes}
                        nowLabel={now?.label ?? null}
                        dragging={dragging}
                        setDragging={setDragging}
                        onOpen={setOpenId}
                        onDrop={drop}
                        today={today}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid min-w-[64rem]" style={{ gridTemplateColumns: "11.5rem 9.5rem minmax(0,1fr)" }} aria-label="Quadro de despacho do dia">
            <div className="sticky left-0 z-20 bg-night px-3 py-2.5 text-xs text-steel">Técnico</div>
            <div className="border-l border-rime px-2.5 py-2.5 text-xs text-steel">Sem horário</div>
            <div className="relative border-l border-rime py-2.5">
              {HOURS.map((h) => (
                <span
                  key={h}
                  className="readout absolute top-2.5 -translate-x-1/2 text-[0.68rem] text-steel first:translate-x-1"
                  style={{ left: `${((h - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}
                >
                  {hhmm(h)}
                </span>
              ))}
              <span className="invisible text-xs">00</span>
            </div>
            {technicians.map((t) => {
              const stats = perTech(t.id);
              return (
                <div key={t.id} className="contents">
                  <div className="sticky left-0 z-10 flex flex-col justify-center gap-0.5 border-t border-rime bg-night px-3 py-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-silver">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="truncate">{t.name}</span>
                    </span>
                    <span className="readout pl-[1.125rem] text-xs text-steel">
                      {stats.count} {stats.count === 1 ? "OM" : "OMs"}, {formatHours(stats.minutes)}
                    </span>
                  </div>
                  <DayRow
                    tech={t}
                    date={days[0].date}
                    items={onBoard.filter((i) => i.technicianId === t.id)}
                    nowMinutes={nowMinutes}
                    isToday={days[0].date === today}
                    dragging={dragging}
                    setDragging={setDragging}
                    onOpen={setOpenId}
                    onDrop={drop}
                    today={today}
                  />
                </div>
              );
            })}
          </div>
        )}
        {technicians.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-steel">
            Nenhum técnico ativo. <Link href="/admin/tecnicos" className="text-ice hover:text-frost">Cadastre um técnico</Link> para montar a agenda.
          </p>
        )}
      </div>

      <MoveDialog
        item={openItem}
        technicians={technicians}
        onMove={(id, target) => drop(id, target, true)}
        onClose={() => setOpenId(null)}
      />
    </LayoutGroup>
  );
}
