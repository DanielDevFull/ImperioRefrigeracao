import { formatNumber } from "@/lib/format";
import { productCategory, productUnit } from "@/lib/labels";

/** "22,6 kg", "12 un" */
export function formatQty(quantity: number | null | undefined, unit: string | null | undefined) {
  return `${formatNumber(quantity ?? 0)} ${unit ?? "un"}`;
}

/** Quantidade com sinal para o histórico de movimentações: "+12 un", "−3,5 kg". */
export function formatSignedQty(quantity: number, unit: string) {
  const sign = quantity > 0 ? "+" : quantity < 0 ? "−" : "";
  return `${sign}${formatQty(Math.abs(quantity), unit)}`;
}

/** Lê "22,6", "1.234,5" ou "22.6" (mesma regra de formValues().money). */
export function parseDecimal(value: string | null | undefined): number | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  const n = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Custo médio ponderado após uma entrada:
 * (saldo anterior × custo anterior + quantidade × custo da entrada) / (saldo anterior + quantidade).
 * Saldo negativo ou zerado não pesa (o custo passa a ser o da entrada).
 */
export function weightedAverageCost(oldQty: number, oldCost: number, quantity: number, unitCost: number) {
  const base = Math.max(0, oldQty);
  if (quantity <= 0) return round2(oldCost);
  if (base <= 0 || oldCost <= 0) return round2(unitCost);
  return round2((base * oldCost + quantity * unitCost) / (base + quantity));
}

export const categoryOptions = Object.entries(productCategory).map(([value, label]) => ({ value, label }));

export const unitOptions = Object.entries(productUnit).map(([value, label]) => ({
  value,
  label: value === label ? value : `${value} (${label})`,
}));

/** Quanto do mínimo o saldo cobre (0..1 = abaixo; >1 = folga). */
export function stockRatio(total: number, minStock: number) {
  if (minStock <= 0) return null;
  return total / minStock;
}
