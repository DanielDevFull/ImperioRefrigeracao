/**
 * Regras puras do orçamento: totais, desconto e vencimento.
 *
 * Na aprovação o orçamento vira uma OM cobrada do cliente:
 *   - material com produto do estoque → material cobrado na OM (mesmo preço, baixa no estoque);
 *   - o resto (serviços, e material cujo produto deixou de existir) → mão de obra da OM.
 * O desconto sai da mão de obra. Assim o total da OM concluída é exatamente o total aprovado.
 */
import { diffDays, type ISODate } from "@/lib/dates";
import { round2 } from "./billing";

export type QuoteStatus = "rascunho" | "enviado" | "aprovado" | "recusado" | "cancelado";
export type EffectiveQuoteStatus = QuoteStatus | "vencido";

export const OPEN_QUOTE_STATUSES = ["rascunho", "enviado"] as const satisfies readonly QuoteStatus[];

export type QuoteLine = {
  kind: "servico" | "material";
  productId: string | null;
  quantity: number;
  unitPrice: number;
};

/** A linha vira material cobrado na OM (o resto entra como mão de obra). */
export const becomesOmMaterial = (l: Pick<QuoteLine, "kind" | "productId">) => l.kind === "material" && !!l.productId;

export const lineTotal = (l: Pick<QuoteLine, "quantity" | "unitPrice">) => round2(l.quantity * l.unitPrice);

export type QuoteTotals = {
  /** Serviços (e materiais sem produto): viram mão de obra */
  services: number;
  /** Materiais do estoque: viram materiais cobrados na OM */
  materials: number;
  subtotal: number;
  discount: number;
  total: number;
  /** Mão de obra da OM gerada: serviços − desconto */
  labor: number;
};

/**
 * Totais do orçamento. Cada grupo é somado sem arredondar linha a linha e arredondado no fim,
 * do mesmo jeito que a OM soma os materiais cobrados: o valor cobrado bate com o aprovado.
 */
export function quoteTotals(lines: QuoteLine[], discount = 0): QuoteTotals {
  let services = 0;
  let materials = 0;
  for (const l of lines) {
    const v = l.quantity * l.unitPrice;
    if (becomesOmMaterial(l)) materials += v;
    else services += v;
  }
  services = round2(services);
  materials = round2(materials);
  const subtotal = round2(services + materials);
  const d = round2(Math.max(0, discount || 0));
  return { services, materials, subtotal, discount: d, total: round2(subtotal - d), labor: round2(services - d) };
}

/** O desconto sai da mão de obra: não pode passar do valor dos serviços. */
export const discountFits = (t: Pick<QuoteTotals, "services" | "discount">) => t.discount <= t.services;

export const isQuoteOpen = (status: string) => (OPEN_QUOTE_STATUSES as readonly string[]).includes(status);

/** Rascunho ou enviado com validade antes de hoje aparece como "vencido". */
export function effectiveQuoteStatus(status: QuoteStatus, validUntil: ISODate, today: ISODate): EffectiveQuoteStatus {
  return isQuoteOpen(status) && validUntil < today ? "vencido" : status;
}

/** Dias até o fim da validade (0 = vence hoje; negativo = vencido). */
export const daysToExpire = (validUntil: ISODate, today: ISODate) => diffDays(today, validUntil);
