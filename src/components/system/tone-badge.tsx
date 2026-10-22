import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

/**
 * Tinta mais funda no tema claro para texto sobre o próprio tom (etiquetas, contadores): a cor de
 * status pura passa 4,5:1 no branco, mas o fundo tingido de 8–15% a derruba para ~4:1. Misturar 15%
 * da tinta do texto (silver = azul-marinho no claro) mantém o matiz e volta a passar. No escuro
 * não muda nada. frost, steel e violet já passam.
 */
const INK_LIGHT: Record<Tone, string> = {
  ice: "light:text-[color-mix(in_srgb,var(--ice)_85%,var(--silver))]",
  frost: "",
  mint: "light:text-[color-mix(in_srgb,var(--mint)_85%,var(--silver))]",
  brass: "light:text-[color-mix(in_srgb,var(--brass)_85%,var(--silver))]",
  red: "light:text-[color-mix(in_srgb,var(--gauge-red)_85%,var(--silver))]",
  steel: "",
  violet: "",
};

const TONE: Record<Tone, string> = {
  ice: `bg-ice/12 text-ice ring-ice/30 ${INK_LIGHT.ice}`,
  frost: "bg-frost/10 text-frost ring-frost/25",
  mint: `bg-mint/12 text-mint ring-mint/30 ${INK_LIGHT.mint}`,
  brass: `bg-brass/12 text-brass ring-brass/30 ${INK_LIGHT.brass}`,
  red: `bg-gauge-red/12 text-gauge-red ring-gauge-red/35 ${INK_LIGHT.red}`,
  steel: "bg-steel/10 text-steel ring-steel/25",
  violet: "bg-violet/12 text-violet ring-violet/30",
};

const DOT: Record<Tone, string> = {
  ice: "bg-ice",
  frost: "bg-frost",
  mint: "bg-mint",
  brass: "bg-brass",
  red: "bg-gauge-red",
  steel: "bg-steel",
  violet: "bg-violet",
};

/** Etiqueta de estado com cor semântica. `live` faz o ponto pulsar (algo acontecendo agora). */
export function ToneBadge({
  tone,
  children,
  live = false,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  live?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[tone], live && "animate-breathe")} />
      {children}
    </span>
  );
}

export const toneText: Record<Tone, string> = {
  ice: "text-ice",
  frost: "text-frost",
  mint: "text-mint",
  brass: "text-brass",
  red: "text-gauge-red",
  steel: "text-steel",
  violet: "text-violet",
};

/** Texto no tom sobre um fundo tingido do mesmo tom (ex.: bg-mint/10): legível também no tema claro. */
export const toneOnTint: Record<Tone, string> = {
  ice: `text-ice ${INK_LIGHT.ice}`,
  frost: "text-frost",
  mint: `text-mint ${INK_LIGHT.mint}`,
  brass: `text-brass ${INK_LIGHT.brass}`,
  red: `text-gauge-red ${INK_LIGHT.red}`,
  steel: "text-steel",
  violet: "text-violet",
};

export const toneBg: Record<Tone, string> = DOT;
