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
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Ícone lucide a partir de equipment_types.icon (nome em kebab-case). */
function Glyph({ name, className }: { name: string | null | undefined; className?: string }) {
  const p = { className, strokeWidth: 1.75 };
  switch (name) {
    case "square-dashed":
      return <SquareDashed {...p} />;
    case "panel-top":
      return <PanelTop {...p} />;
    case "app-window":
      return <AppWindow {...p} />;
    case "network":
      return <Network {...p} />;
    case "server":
      return <Server {...p} />;
    case "box":
      return <Box {...p} />;
    case "warehouse":
      return <Warehouse {...p} />;
    case "refrigerator":
      return <Refrigerator {...p} />;
    case "glass-water":
      return <GlassWater {...p} />;
    case "snowflake":
      return <Snowflake {...p} />;
    default:
      return <AirVent {...p} />;
  }
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
      <Glyph name={icon} className={glyph} />
    </span>
  );
}
