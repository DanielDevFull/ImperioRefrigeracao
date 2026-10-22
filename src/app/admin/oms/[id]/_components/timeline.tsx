import {
  ArrowRightLeft,
  CalendarClock,
  Camera,
  FilePlus2,
  MapPin,
  Package,
  PenLine,
  StickyNote,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import { ToneBadge } from "@/components/system/tone-badge";
import { formatDateTime, formatRelative } from "@/lib/format";
import { labelOf, workOrderStatus } from "@/lib/labels";

export type TimelineEvent = {
  id: string;
  kind: string;
  message: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  userName: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: Date;
};

const KIND: Record<string, { icon: LucideIcon; label: string; ring: string }> = {
  created: { icon: FilePlus2, label: "OM criada", ring: "text-frost ring-frost/30 bg-frost/10" },
  status: { icon: ArrowRightLeft, label: "Status alterado", ring: "text-ice ring-ice/30 bg-ice/10" },
  assigned: { icon: UserRoundCheck, label: "Técnico atribuído", ring: "text-violet ring-violet/30 bg-violet/10" },
  rescheduled: { icon: CalendarClock, label: "Reagendada", ring: "text-violet ring-violet/30 bg-violet/10" },
  material: { icon: Package, label: "Material", ring: "text-brass ring-brass/30 bg-brass/10" },
  photo: { icon: Camera, label: "Fotos", ring: "text-frost ring-frost/30 bg-frost/10" },
  signature: { icon: PenLine, label: "Assinatura", ring: "text-mint ring-mint/30 bg-mint/10" },
  note: { icon: StickyNote, label: "Anotação", ring: "text-steel ring-steel/30 bg-steel/10" },
};

function StatusPill({ status }: { status: string }) {
  const l = labelOf(workOrderStatus, status);
  return <ToneBadge tone={l.tone}>{l.label}</ToneBadge>;
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="px-5 py-6 text-sm text-steel">Nenhum registro ainda.</p>;
  return (
    <ol className="relative px-5 py-4">
      {events.map((e, i) => {
        const k = KIND[e.kind] ?? KIND.note;
        const Icon = k.icon;
        const last = i === events.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span aria-hidden className="absolute left-[0.9375rem] top-8 bottom-0 w-px bg-rime" />}
            <span className={`relative grid size-8 shrink-0 place-items-center rounded-full ring-1 ${k.ring}`}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm text-silver">
                {e.kind === "status" && e.toStatus ? `Status: ${labelOf(workOrderStatus, e.toStatus).label}` : k.label}
              </p>
              {(e.fromStatus || e.toStatus) && e.fromStatus !== e.toStatus && e.kind !== "created" && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-steel">
                  {e.fromStatus && <StatusPill status={e.fromStatus} />}
                  {e.fromStatus && e.toStatus && <span aria-label="para">para</span>}
                  {e.toStatus && <StatusPill status={e.toStatus} />}
                </div>
              )}
              {e.message && <p className="mt-1 text-xs leading-relaxed text-steel">{e.message}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.72rem] text-steel/80 light:text-steel">
                <time dateTime={e.createdAt.toISOString()} title={formatDateTime(e.createdAt)}>
                  {formatRelative(e.createdAt)}
                </time>
                <span>{e.userName ? `por ${e.userName}` : "pelo sistema"}</span>
                {e.lat != null && e.lng != null && (
                  <a
                    href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-ice hover:text-frost"
                  >
                    <MapPin className="size-3" />
                    Ver no mapa
                  </a>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
