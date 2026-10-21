import { cn } from "@/lib/utils";

/**
 * Medidor fino do saldo em relação ao mínimo: a marca vertical é o ponto de reposição
 * (no meio da trilha); a barra enche até o dobro do mínimo.
 */
export function StockGauge({ total, minStock, className }: { total: number; minStock: number; className?: string }) {
  if (minStock <= 0) return null;
  const ratio = Math.max(0, total) / (minStock * 2);
  const below = total < minStock;
  return (
    <span
      className={cn("relative inline-block h-1 w-14 shrink-0 overflow-hidden rounded-full bg-ice/10", className)}
      role="meter"
      aria-valuenow={total}
      aria-valuemin={0}
      aria-valuemax={minStock * 2}
      aria-label={below ? "Abaixo do mínimo" : "Acima do mínimo"}
    >
      <span
        className={cn("absolute inset-y-0 left-0 rounded-full", below ? "bg-gauge-red" : "bg-ice/70")}
        style={{ width: `${Math.min(1, ratio) * 100}%` }}
      />
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-silver/50" />
    </span>
  );
}
