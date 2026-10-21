"use client";

import { motion, useReducedMotion } from "motion/react";
import { formatValue, type ValueFormat } from "./theme";

/**
 * Lista de barras horizontais para comparar categorias (melhor que pizza).
 * O rótulo e o valor ficam em tinta de texto; a barra usa uma única cor.
 */
export function BarList({
  items,
  format = "number",
  color = "#2e8fe6",
}: {
  items: { label: string; value: number; hint?: string; color?: string }[];
  format?: ValueFormat;
  color?: string;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((it, idx) => (
        <li key={it.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-silver">{it.label}</span>
            <span className="shrink-0 tabular-nums text-steel">
              {formatValue(it.value, format)}
              {it.hint && <span className="ml-1.5 text-xs text-steel/70">{it.hint}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ice/8">
            <motion.div
              className="h-full rounded-full"
              style={{ background: it.color ?? color }}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${(it.value / max) * 100}%` }}
              transition={{ duration: 0.8, delay: idx * 0.05, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
