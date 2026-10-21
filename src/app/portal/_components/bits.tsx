import Link from "next/link";
import { createElement } from "react";
import {
  AirVent,
  AppWindow,
  Box,
  ChevronRight,
  GlassWater,
  Network,
  PanelTop,
  Refrigerator,
  Server,
  Snowflake,
  SquareDashed,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { ToneBadge, toneBg, toneText } from "@/components/system/tone-badge";
import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { describeStatus } from "../_lib/copy";
import type { Health } from "../_lib/forecast";

/** Título de seção do portal (Cinzel, ≥ 20px) com link opcional à direita. */
export function SectionTitle({
  children,
  href,
  linkLabel,
  count,
  className,
}: {
  children: React.ReactNode;
  href?: string;
  linkLabel?: string;
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <h2 className="font-display text-silver-brushed text-[1.15rem] font-semibold tracking-[0.02em] sm:text-xl">
        {children}
        {count != null && count > 0 && (
          <span className="readout ml-2 align-middle font-sans text-sm font-medium text-steel">{count}</span>
        )}
      </h2>
      {href && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-sm text-steel transition-colors hover:text-frost">
          {linkLabel ?? "Ver tudo"}
          <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

const ICONS: Record<string, LucideIcon> = {
  "air-vent": AirVent,
  "square-dashed": SquareDashed,
  "panel-top": PanelTop,
  "app-window": AppWindow,
  network: Network,
  server: Server,
  box: Box,
  warehouse: Warehouse,
  refrigerator: Refrigerator,
  "glass-water": GlassWater,
  snowflake: Snowflake,
};

export function EquipmentIcon({ icon, className }: { icon?: string | null; className?: string }) {
  return createElement(ICONS[icon ?? ""] ?? AirVent, { className, "aria-hidden": true });
}

/** Ícone do tipo de equipamento num disco gelado. */
export function EquipmentTile({ icon, size = "md", className }: { icon?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-ice/18 to-ice-deep/10 text-frost ring-1 ring-ice/20",
        size === "sm" && "size-9 [&_svg]:size-4",
        size === "md" && "size-11 [&_svg]:size-5",
        size === "lg" && "size-16 rounded-2xl [&_svg]:size-7",
        className,
      )}
    >
      <EquipmentIcon icon={icon} />
    </span>
  );
}

/** Estado da OM em linguagem do cliente ("Técnico a caminho"…). */
export function CustomerStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = describeStatus({ status });
  return (
    <ToneBadge tone={s.tone} live={s.live} className={className}>
      {s.label}
    </ToneBadge>
  );
}

/** Indicador de saúde: rótulo + régua do intervalo entre manutenções. */
export function HealthMeter({ health, className, showHint = false }: { health: Health; className?: string; showHint?: boolean }) {
  return (
    <div className={cn("min-w-0", className)}>
      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", toneText[health.tone])}>
        <span className={cn("size-1.5 rounded-full", toneBg[health.tone])} />
        {health.label}
      </span>
      {health.progress != null && (
        <span
          className="mt-1.5 block h-1 w-full max-w-28 overflow-hidden rounded-full bg-steel/15"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(health.progress * 100)}
          aria-label="Tempo desde a última manutenção"
        >
          <span
            className={cn("block h-full rounded-full", meterTone(health))}
            style={{ width: `${Math.max(6, Math.round(health.progress * 100))}%` }}
          />
        </span>
      )}
      {showHint && <span className="mt-1 block text-xs text-steel">{health.hint}</span>}
    </div>
  );
}

function meterTone(h: Health) {
  if (h.tone !== "mint") return toneBg[h.tone];
  return (h.progress ?? 0) > 0.85 ? "bg-brass" : "bg-gradient-to-r from-mint/70 to-ice";
}

/** Disco de ícone com tom semântico (pendências, linha do tempo). */
export function ToneDot({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  const ring: Record<Tone, string> = {
    ice: "bg-ice/12 text-ice ring-ice/30",
    frost: "bg-frost/10 text-frost ring-frost/25",
    mint: "bg-mint/12 text-mint ring-mint/30",
    brass: "bg-brass/12 text-brass ring-brass/30",
    red: "bg-gauge-red/12 text-gauge-red ring-gauge-red/35",
    steel: "bg-steel/10 text-steel ring-steel/25",
    violet: "bg-violet/12 text-violet ring-violet/30",
  };
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full ring-1 [&_svg]:size-[1.1rem]", ring[tone], className)}>
      {children}
    </span>
  );
}

/** Data em bloco de calendário (dia grande + mês). */
export function DateChip({ date, tone = "frost", className }: { date: string | null; tone?: Tone; className?: string }) {
  if (!date) {
    return (
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl bg-steel/8 text-xs text-steel ring-1 ring-rime", className)}>
        —
      </span>
    );
  }
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const day = d.getUTCDate();
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(d).replace(".", "");
  return (
    <span
      className={cn(
        "flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-night ring-1 ring-rime",
        className,
      )}
    >
      <span className={cn("readout text-lg font-semibold leading-none", toneText[tone])}>{day}</span>
      <span className="mt-0.5 text-[0.65rem] leading-none text-steel">{month}</span>
    </span>
  );
}
