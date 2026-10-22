import Link from "next/link";
import { AnimatedNumber } from "@/components/brand/animated-number";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";
import { toneText } from "./tone-badge";

export type Readout = {
  label: string;
  value: number;
  format?: "brl" | "brl-compact" | "number" | "percent" | "integer";
  hint?: string;
  tone?: Tone;
  /** Ajuste fino do número (ex.: tom diferente só no claro). */
  valueClassName?: string;
  href?: string;
};

/**
 * Faixa de leitura contínua, inspirada no display do aparelho:
 * números grandes e tabulares, separados por divisórias finas.
 */
export function ReadoutBand({ items, className }: { items: Readout[]; className?: string }) {
  return (
    <div
      className={cn(
        "glass frost-edge grid grid-cols-2 overflow-hidden rounded-2xl md:grid-flow-col md:auto-cols-fr md:grid-cols-none",
        className,
      )}
    >
      {items.map((it, i) => {
        const body = (
          <>
            <span className="text-xs text-steel">{it.label}</span>
            <AnimatedNumber
              value={it.value}
              format={it.format ?? "integer"}
              className={cn(
                "readout mt-1.5 block whitespace-nowrap text-xl font-semibold sm:text-2xl md:text-[1.7rem]",
                it.tone ? toneText[it.tone] : "text-silver",
                it.valueClassName,
              )}
            />
            {it.hint && <span className="mt-1 block text-xs text-steel/80 light:text-steel">{it.hint}</span>}
          </>
        );
        const cls = cn(
          "relative flex min-w-0 flex-col px-4 py-4 sm:px-5 md:py-5",
          i % 2 === 1 && "border-l border-rime md:border-l",
          i >= 2 && "border-t border-rime md:border-t-0",
          i > 0 && "md:border-l md:border-rime",
          it.href && "transition-colors hover:bg-ice/5",
          // número ímpar de leituras: a última ocupa a linha inteira no celular
          items.length % 2 === 1 && i === items.length - 1 && "col-span-2 md:col-span-1",
        );
        return it.href ? (
          <Link key={it.label} href={it.href} className={cls}>
            {body}
          </Link>
        ) : (
          <div key={it.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
