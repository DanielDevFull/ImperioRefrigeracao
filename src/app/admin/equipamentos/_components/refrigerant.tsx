import { ToneBadge } from "@/components/system/tone-badge";

/** HCFC-22 está em eliminação (Protocolo de Montreal): sinalizar para avaliar retrofit. */
export const isPhaseOut = (refrigerant: string | null | undefined) =>
  Boolean(refrigerant && /^r-?22$/i.test(refrigerant.trim()));

export function RefrigerantTag({ value, compact = false }: { value: string | null | undefined; compact?: boolean }) {
  if (!value) return <span className="text-steel">—</span>;
  if (isPhaseOut(value))
    return (
      <ToneBadge tone="brass" className="font-semibold">
        {compact ? "R-22" : "R-22: avaliar retrofit"}
      </ToneBadge>
    );
  return <span className="tabular-nums text-silver/90">{value}</span>;
}
