import { formatBRL, formatNumber } from "@/lib/format";
import type { Tone } from "@/lib/labels";

/** Taxa da regra/lançamento: percentual ou valor fixo em R$. */
export function formatRate(basis: string, rate: number) {
  return basis === "fixo_por_om" ? formatBRL(rate) : `${formatNumber(rate)}%`;
}

/** Abrangência da regra (quanto mais específica, maior o peso). */
export function scopeOf(r: { technicianId: string | null; workOrderType: string | null }) {
  if (r.technicianId && r.workOrderType) return { label: "Técnico + tipo", rank: 4 };
  if (r.technicianId) return { label: "Técnico", rank: 3 };
  if (r.workOrderType) return { label: "Tipo", rank: 2 };
  return { label: "Geral", rank: 1 };
}

/** Situação do fechamento (commission_payouts.status). */
export const payoutStatus: Record<string, { label: string; tone: Tone }> = {
  aberto: { label: "Aguardando pagamento", tone: "brass" },
  pago: { label: "Pago", tone: "mint" },
  cancelado: { label: "Desfeito", tone: "steel" },
};
