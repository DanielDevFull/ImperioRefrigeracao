"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { CHART, SERIES, formatValue, type ValueFormat } from "./theme";

export type Series = { key: string; label: string };

/**
 * Evolução no tempo (área com linha de 2px). Uma série: sem legenda (o título nomeia).
 * Duas ou mais: legenda acima e cores na ordem fixa da paleta.
 */
export function TrendChart({
  data,
  xKey,
  series,
  format = "number",
  height = 240,
  stacked = false,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  format?: ValueFormat;
  height?: number;
  stacked?: boolean;
}) {
  return (
    <div>
      {series.length > 1 && <Legend series={series} />}
      <div style={{ height }} role="img" aria-label={`Gráfico de ${series.map((s) => s.label).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES[i]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={SERIES[i]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            {/* até 8 pontos mostra todos os meses (o padrão pulava um rótulo no meio) */}
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tick={{ fill: CHART.axis, fontSize: 12 }}
              tickMargin={8}
              interval={data.length <= 8 ? 0 : "preserveStartEnd"}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={80}
              tick={{ fill: CHART.axis, fontSize: 12 }}
              tickFormatter={(v: number) => formatValue(v, format === "brl" ? "brl-compact" : format)}
            />
            <Tooltip cursor={{ stroke: CHART.cursor, strokeWidth: 1 }} content={<ChartTooltip format={format} />} />
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stackId={stacked ? "a" : undefined}
                stroke={SERIES[i]}
                strokeWidth={2}
                fill={`url(#fill-${s.key})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
                animationDuration={900}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: SERIES[i] }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
