/**
 * Paleta categórica dos gráficos — validada (scripts do skill dataviz) no fundo #0a1428:
 * faixa de luminosidade, croma, separação para daltonismo (ΔE ≥ 13) e contraste ≥ 3:1.
 * A ordem é o mecanismo de segurança: atribua sempre nesta ordem, nunca cicle.
 * Cores de status (mint/brass/gauge-red) são reservadas para estados, não para séries.
 */
export const SERIES = ["#2e8fe6", "#199e70", "#9085e9", "#c98500", "#d55181"] as const;

export const CHART = {
  grid: "rgb(148 190 255 / 0.08)",
  axis: "#8da2bf",
  surface: "#0a1428",
  cursor: "rgb(184 227 255 / 0.35)",
  textPrimary: "#e6edf5",
  textSecondary: "#8da2bf",
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
