import Link from "next/link";
import { CheckCircle2, MapPin, Navigation } from "lucide-react";
import { PriorityBadge, WorkOrderStatusBadge, WorkOrderTypeBadge } from "@/components/system/status";
import { ToneBadge, toneBg } from "@/components/system/tone-badge";
import { addressLine, formatDayMonth, formatOM, formatTime, mapsLink } from "@/lib/format";
import { labelOf, workOrderStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { endTime, type TicketGroup } from "../_lib/board";
import { customerName, type TicketRow } from "../_lib/queries";
import { ProgressRing } from "./progress-ring";

function MapButton({ href, compact = false }: { href: string; compact?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "relative z-10 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ice ring-1 ring-ice/25 transition-colors active:bg-ice/15",
        compact && "px-2.5",
      )}
    >
      <Navigation className="size-4" />
      Abrir no mapa
    </a>
  );
}

function equipmentLine(r: TicketRow) {
  const e = r.equipment;
  if (!e) return r.title;
  const type = e.type?.name ?? [e.brand, e.model].filter(Boolean).join(" ");
  return [type, e.location].filter(Boolean).join(" — ") || r.title;
}

/** Ticket grande e tocável de uma OM. */
export function OmTicket({
  row,
  today,
  showAddress = true,
}: {
  row: TicketRow;
  today: string;
  showAddress?: boolean;
}) {
  const done = row.tasks.filter((t) => t.done).length;
  const total = row.tasks.length;
  const overdue = row.scheduledDate != null && row.scheduledDate < today && row.status !== "concluida";
  const concluded = row.status === "concluida";
  const tone = overdue ? "red" : labelOf(workOrderStatus, row.status).tone;
  const start = row.scheduledTime ? formatTime(row.scheduledTime) : null;
  const end = endTime(row.scheduledTime, row.plan?.estimatedMinutes ?? 60);
  const address = addressLine(row.site);
  const map = row.site ? mapsLink(row.site) : null;
  const customer = customerName(row.customer);

  return (
    <article
      className={cn(
        "panel relative overflow-hidden transition-transform active:scale-[0.99]",
        overdue && "ring-1 ring-gauge-red/45",
        concluded && "opacity-75",
      )}
    >
      <Link
        href={`/tecnico/om/${row.id}`}
        className="absolute inset-0 z-0 rounded-[inherit]"
        aria-label={`Abrir ${formatOM(row.number)} — ${customer}`}
      />
      <span aria-hidden className={cn("absolute inset-y-3 left-0 w-[3px] rounded-r-full", toneBg[tone])} />
      <div className="pointer-events-none relative flex gap-3 py-4 pl-4 pr-3.5">
        <div className="w-[3.4rem] shrink-0">
          {overdue ? (
            <>
              <p className="readout text-lg font-semibold leading-tight text-gauge-red">{formatDayMonth(row.scheduledDate)}</p>
              <p className="mt-0.5 text-xs text-gauge-red/80">{start ?? "sem hora"}</p>
            </>
          ) : start ? (
            <>
              <p className="readout text-lg font-semibold leading-tight text-silver">{start}</p>
              {end && <p className="readout mt-0.5 text-xs text-steel">até {end}</p>}
            </>
          ) : (
            <p className="pt-0.5 text-xs leading-tight text-steel">Sem horário</p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.05rem] font-semibold leading-snug text-silver">{customer}</p>
          <p className="mt-0.5 truncate text-sm text-frost/85">{equipmentLine(row)}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {overdue && <ToneBadge tone="red">Atrasada</ToneBadge>}
            <WorkOrderStatusBadge status={row.status} />
            <WorkOrderTypeBadge type={row.type} />
            {(row.priority === "alta" || row.priority === "urgente") && <PriorityBadge value={row.priority} />}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between">
          {concluded ? (
            <CheckCircle2 className="size-7 text-mint" aria-label="Concluída" />
          ) : (
            <ProgressRing done={done} total={total} size={42} />
          )}
          <span className="readout text-[0.68rem] text-steel/80">{formatOM(row.number)}</span>
        </div>
      </div>
      {showAddress && (address || map) && (
        <div className="pointer-events-none relative flex items-center gap-2 border-t border-rime py-1.5 pl-4 pr-1.5">
          <MapPin className="size-4 shrink-0 text-steel" />
          <p className="min-w-0 flex-1 truncate text-[0.82rem] text-steel">{address || "Endereço não cadastrado"}</p>
          {map && (
            <span className="pointer-events-auto">
              <MapButton href={map} compact />
            </span>
          )}
        </div>
      )}
    </article>
  );
}

/** Lista do dia: OMs do mesmo endereço em sequência viram um grupo. */
export function TicketList({ groups, today }: { groups: TicketGroup[]; today: string }) {
  return (
    <ol className="space-y-3">
      {groups.map((g, gi) => {
        if (g.rows.length === 1) {
          return (
            <li key={g.rows[0].id}>
              <OmTicket row={g.rows[0]} today={today} />
            </li>
          );
        }
        const site = g.rows[0].site;
        const map = site ? mapsLink(site) : null;
        return (
          <li key={`${g.siteId}-${gi}`} className="rounded-[1.4rem] bg-night/40 p-1.5 ring-1 ring-rime">
            <div className="flex items-center gap-2.5 px-2.5 pb-2 pt-1.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ice/10 text-ice ring-1 ring-ice/25">
                <MapPin className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-silver">{g.rows.length} equipamentos neste endereço</p>
                <p className="truncate text-xs text-steel">{addressLine(site) || site?.name}</p>
              </div>
              {map && <MapButton href={map} compact />}
            </div>
            <ol className="space-y-1.5">
              {g.rows.map((r) => (
                <li key={r.id}>
                  <OmTicket row={r} today={today} showAddress={false} />
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
