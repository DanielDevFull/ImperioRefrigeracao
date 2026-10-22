/**
 * Paleta categórica dos gráficos — validada (scripts do skill dataviz) no cartão de cada tema:
 * escuro #0a1428 (#2e8fe6 #199e70 #9085e9 #c98500 #d55181) e claro #ffffff
 * (#2a78d6 #16956b #6250d6 #b57a00 #d14f86): faixa de luminosidade, croma, separação para
 * daltonismo (ΔE ≥ 12) e contraste ≥ 3:1. Os valores ficam em CSS (--series-n, globals.css),
 * então o gráfico acompanha o tema sem JavaScript.
 * A ordem é o mecanismo de segurança: atribua sempre nesta ordem, nunca cicle.
 * Cores de status (mint/brass/gauge-red) são reservadas para estados, não para séries.
 */
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"] as const;

export const CHART = {
  grid: "var(--chart-grid)",
  axis: "var(--steel)",
  surface: "var(--night)",
  cursor: "var(--chart-cursor)",
  band: "var(--chart-band)",
  textPrimary: "var(--silver)",
  textSecondary: "var(--steel)",
};

export type ValueFormat = "brl" | "brl-compact" | "integer" | "percent" | "number";

export function formatValue(v: number, f: ValueFormat = "number") {
  switch (f) {
    case "brl":
      return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "brl-compact":
      return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 });
    case "integer":
      return Math.round(v).toLocaleString("pt-BR");
    case "percent":
      return v.toLocaleString("pt-BR", { style: "percent", maximumFractionDigits: 1 });
    default:
      return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
}
