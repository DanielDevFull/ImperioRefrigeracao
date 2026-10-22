"use client";

import { motion } from "motion/react";
import {
  CalendarCheck,
  CheckCheck,
  CircleDashed,
  Lock,
  PackageX,
  Pause,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { formatDate, formatOM } from "@/lib/format";
import { labelOf, workOrderType } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { LOCKED, type BoardItem } from "../_lib/board";

export const DRAG_TYPE = "application/x-imperium-om";

const STATUS: Record<string, { icon: LucideIcon; label: string; text: string }> = {
  aberta: { icon: CircleDashed, label: "Aberta", text: "text-frost" },
  agendada: { icon: CalendarCheck, label: "Agendada", text: "text-violet" },
  em_deslocamento: { icon: Truck, label: "A caminho", text: "text-ice" },
  em_execucao: { icon: Wrench, label: "Em execução", text: "text-ice" },
  pausada: { icon: Pause, label: "Pausada", text: "text-brass" },
  aguardando_material: { icon: PackageX, label: "Aguardando material", text: "text-brass" },
  concluida: { icon: CheckCheck, label: "Concluída", text: "text-mint" },
  cancelada: { icon: CircleDashed, label: "Cancelada", text: "text-steel" },
};

/** Barra de cor por tipo de OM (o tipo também aparece escrito no chip). */
const TYPE_BAR: Record<string, string> = {
  preventiva: "before:bg-ice",
  corretiva: "before:bg-gauge-red",
  instalacao: "before:bg-violet",
  visita_tecnica: "before:bg-frost",
  pmoc: "before:bg-mint",
};

export function OmChip({
  item,
  late,
  dragging,
  onDragState,
  onOpen,
  className,
  showDate = false,
  compact = false,
}: {
  item: BoardItem;
  late: boolean;
  dragging: boolean;
  onDragState: (id: string | null) => void;
  onOpen: (id: string) => void;
  className?: string;
  showDate?: boolean;
  /** Visão diária: cartão estreito, sem número e tipo (o número vai no rótulo acessível). */
  compact?: boolean;
}) {
  const locked = LOCKED.has(item.status);
  const s = STATUS[item.status] ?? STATUS.aberta;
  const Icon = s.icon;
  const urgent = item.priority === "urgente" || item.priority === "alta";
  const when = showDate
    ? [item.scheduledDate ? formatDate(item.scheduledDate).slice(0, 5) : null, item.scheduledTime].filter(Boolean).join(" ")
    : item.scheduledTime;

  return (
    <motion.div layoutId={`om-${item.id}`} layout="position" transition={{ type: "spring", stiffness: 520, damping: 42 }} className={className}>
      <div
        role="button"
        tabIndex={0}
        draggable={!locked}
        aria-label={`${formatOM(item.number)}, ${item.customerName}, ${s.label}${locked ? ", bloqueada" : ""}. Abrir opções`}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, item.id);
          e.dataTransfer.setData("text/plain", formatOM(item.number));
          e.dataTransfer.effectAllowed = "move";
          onDragState(item.id);
        }}
        onDragEnd={() => onDragState(null)}
        onClick={() => onOpen(item.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(item.id);
          }
        }}
        className={cn(
          "group relative overflow-hidden rounded-md py-1.5 pl-2.5 pr-2 text-left text-xs ring-1 transition-[box-shadow,opacity,background-color] select-none",
          "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
          TYPE_BAR[item.type] ?? "before:bg-steel",
          late ? "bg-gauge-red/10 ring-gauge-red/50" : "bg-glacier/80 ring-rime hover:ring-ice/40",
          locked ? "cursor-pointer opacity-90" : "cursor-grab active:cursor-grabbing",
          item.status === "concluida" && "bg-night/70",
          dragging && "opacity-40",
        )}
      >
        <div className="flex items-center gap-1.5">
          {when ? (
            <span className={cn("readout font-semibold", late ? "text-gauge-red" : "text-silver")}>{when}</span>
          ) : (
            !compact && <span className="whitespace-nowrap text-[0.68rem] text-steel">Sem horário</span>
          )}
          {compact ? (
            <span className="truncate font-medium text-silver">{item.customerName}</span>
          ) : (
            <span className="readout truncate text-[0.68rem] text-steel">{formatOM(item.number)}</span>
          )}
          {urgent && (
            <span className={cn("ml-auto shrink-0 text-[0.65rem] font-semibold", item.priority === "urgente" ? "text-gauge-red" : "text-brass")}>
              {item.priority === "urgente" ? "Urgente" : "Alta"}
            </span>
          )}
          {locked && !compact && <Lock className={cn("size-3 shrink-0 text-steel", !urgent && "ml-auto")} aria-hidden />}
        </div>
        {!compact && <p className="mt-0.5 truncate font-medium text-silver">{item.customerName}</p>}
        <div className="mt-0.5 flex items-center gap-1.5">
          <Icon className={cn("size-3 shrink-0", s.text)} aria-hidden />
          <span className={cn("truncate", s.text)}>{s.label}</span>
          {!compact && <span className="ml-auto shrink-0 text-[0.65rem] text-steel">{labelOf(workOrderType, item.type).label}</span>}
        </div>
        {late && item.scheduledDate && <p className="mt-0.5 text-[0.68rem] font-medium text-gauge-red">Atrasada desde {formatDate(item.scheduledDate).slice(0, 5)}</p>}
      </div>
    </motion.div>
  );
}
