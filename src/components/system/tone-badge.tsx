import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

const TONE: Record<Tone, string> = {
  ice: "bg-ice/12 text-ice ring-ice/30",
  frost: "bg-frost/10 text-frost ring-frost/25",
  mint: "bg-mint/12 text-mint ring-mint/30",
  brass: "bg-brass/12 text-brass ring-brass/30",
  red: "bg-gauge-red/12 text-gauge-red ring-gauge-red/35",
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

export const toneBg: Record<Tone, string> = DOT;
