/** Conversões dos campos numéricos do editor de orçamento (texto em pt-BR ⇄ número). */

/** "1.234,56" → 1234.56; "1,5" → 1.5; "1.5" → 1.5; vazio ou inválido → NaN */
export function parseDecimal(text: string | null | undefined): number {
  const t = (text ?? "").trim();
  if (!t) return NaN;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/** 1234.5 → "1.234,50" (mesmo formato da máscara de dinheiro) */
export const moneyText = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1.5 → "1,5" */
export const qtyText = (n: number) => String(n).replace(".", ",");

/** Mantém só dígitos e um separador decimal enquanto a pessoa digita a quantidade. */
export function sanitizeQty(raw: string) {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  const i = cleaned.search(/[.,]/);
  return i < 0 ? cleaned : cleaned.slice(0, i + 1) + cleaned.slice(i + 1).replace(/[.,]/g, "").slice(0, 3);
}
