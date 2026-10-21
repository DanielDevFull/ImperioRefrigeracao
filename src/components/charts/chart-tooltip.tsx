"use client";

import { formatValue, type ValueFormat } from "./theme";

type Item = { name?: string | number; value?: number | string; color?: string; dataKey?: string | number };

/** Dica flutuante: rótulo em texto primário, valores em tinta de texto e a cor só na marca. */
export function ChartTooltip({
  active,
  payload,
  label,
  format = "number",
  labelFormatter,
}: {
  active?: boolean;
  payload?: Item[];
  label?: string | number;
  format?: ValueFormat;
  labelFormatter?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-lg border border-rime bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      {label != null && <p className="mb-1.5 font-medium text-silver">{labelFormatter ? labelFormatter(label) : label}</p>}
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-steel">
              <span className="size-2 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-medium text-silver tabular-nums">{formatValue(Number(p.value ?? 0), format)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
