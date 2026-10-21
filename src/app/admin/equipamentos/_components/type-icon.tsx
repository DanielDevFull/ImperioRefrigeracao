import {
  AirVent,
  AppWindow,
  Box,
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
import { cn } from "@/lib/utils";

/** Ícones aceitos em equipment_types.icon (nomes do lucide em kebab-case). */
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

export function typeIconFor(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || AirVent;
}

/** Ícone do tipo de equipamento num disco gelado. */
export function TypeIcon({
  icon,
  size = "md",
  className,
}: {
  icon: string | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const Icon = typeIconFor(icon);
  const box = { sm: "size-7", md: "size-9", lg: "size-12", xl: "size-16" }[size];
  const glyph = { sm: "size-3.5", md: "size-4", lg: "size-6", xl: "size-8" }[size];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-b from-ice/18 to-ice/5 text-ice ring-1 ring-ice/25",
        box,
        className,
      )}
    >
      <Icon className={glyph} strokeWidth={1.75} />
    </span>
  );
}
