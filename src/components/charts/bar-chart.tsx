"use client";

import { Bar, BarChart as RBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { Legend, type Series } from "./trend-chart";
import { CHART, SERIES, formatValue, type ValueFormat } from "./theme";

/** Barras verticais (agrupadas ou empilhadas), pontas arredondadas de 4px e respiro de 2px. */
export function BarChart({
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
      <div style={{ height }} role="img" aria-label={`Gráfico de barras: ${series.map((s) => s.label).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <RBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: CHART.axis, fontSize: 12 }} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={80}
              tick={{ fill: CHART.axis, fontSize: 12 }}
              tickFormatter={(v: number) => formatValue(v, format === "brl" ? "brl-compact" : format)}
            />
            <Tooltip cursor={{ fill: "rgb(56 168 255 / 0.06)" }} content={<ChartTooltip format={format} />} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={SERIES[i]}
                stackId={stacked ? "a" : undefined}
                radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
                stroke={stacked ? CHART.surface : undefined}
                strokeWidth={stacked ? 2 : 0}
                maxBarSize={36}
                animationDuration={800}
              />
            ))}
          </RBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
