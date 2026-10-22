"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { monthAbbr } from "../_lib/preview";

export type StripCell = {
  /** primeiro dia do mês, "YYYY-MM-01" */
  month: string;
  value: number;
  /** destaca a célula (ex.: visita com todas as tarefas) */
  emphasis?: boolean;
  /** texto acessível / dica ao passar o mouse */
  title: string;
};

/**
 * Faixa de 12 meses com uma barra por mês. A altura acompanha o valor e anima quando
 * ele muda, para mostrar o efeito de uma edição (frequência, plano, âncora).
 */
export function MonthStrip({ cells, max, className }: { cells: StripCell[]; max?: number; className?: string }) {
  const top = Math.max(1, max ?? Math.max(...cells.map((c) => c.value), 1));
  return (
    <ol className={cn("grid grid-cols-12 gap-1", className)} aria-label="Previsão mês a mês">
      {cells.map((c, i) => {
        const year = c.month.slice(0, 4);
        const showYear = i === 0 || c.month.slice(5, 7) === "01";
        const pct = c.value > 0 ? Math.max(14, (c.value / top) * 100) : 0;
        return (
          <li key={c.month} className="flex min-w-0 flex-col items-center" title={c.title}>
            <span className={cn("mb-1 h-4 text-[0.7rem] tabular-nums", c.value ? "text-silver" : "text-transparent")}>
              {c.value || "0"}
            </span>
            <div className="relative flex h-16 w-full items-end justify-center overflow-hidden rounded-md bg-ice/[0.04] ring-1 ring-inset ring-rime">
              {c.value > 0 ? (
                <motion.div
                  className={cn(
                    "w-full rounded-t-[3px]",
                    c.emphasis ? "bg-gradient-to-t from-ice-deep to-frost" : "bg-gradient-to-t from-ice-deep/80 to-ice",
                  )}
                  initial={false}
                  animate={{ height: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 260, damping: 30 }}
                />
              ) : (
                <span className="mb-2 size-1 rounded-full bg-steel/30" aria-hidden />
              )}
            </div>
            <span className="mt-1.5 text-[0.7rem] capitalize text-steel">{monthAbbr(c.month)}</span>
            <span className={cn("text-[0.62rem] tabular-nums", showYear ? "text-steel/70 light:text-steel/85" : "text-transparent")} aria-hidden={!showYear}>
              {year}
            </span>
            <span className="sr-only">{c.title}</span>
          </li>
        );
      })}
    </ol>
  );
}
