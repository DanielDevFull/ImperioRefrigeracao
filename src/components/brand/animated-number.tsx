"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatBRL, formatBRLCompact, formatNumber, formatPercent } from "@/lib/format";

type Format = "brl" | "brl-compact" | "number" | "percent" | "integer";

function render(value: number, format: Format) {
  switch (format) {
    case "brl":
      return formatBRL(value);
    case "brl-compact":
      return formatBRLCompact(value);
    case "percent":
      return formatPercent(value);
    case "integer":
      return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(value));
    default:
      return formatNumber(value);
  }
}

/** Número que "congela" no valor final: contagem rápida com desaceleração. */
export function AnimatedNumber({
  value,
  format = "number",
  className,
  duration = 1.1,
}: {
  value: number;
  format?: Format;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const from = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || !inView) {
      el.textContent = render(value, format);
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = render(v, format);
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, format, duration, inView, reduce]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {render(reduce ? value : 0, format)}
    </span>
  );
}
