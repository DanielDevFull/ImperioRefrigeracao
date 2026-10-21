/** Constantes do financeiro que servem tanto ao servidor quanto aos componentes cliente. */

/** Cores fixas para categorias (são rótulos, não séries de gráfico). */
export const CATEGORY_SWATCHES = [
  { value: "#38a8ff", label: "Azul gelo" },
  { value: "#3ee0b5", label: "Menta" },
  { value: "#9b8cff", label: "Violeta" },
  { value: "#e8b04b", label: "Latão" },
  { value: "#ff5a6e", label: "Vermelho" },
  { value: "#b8e3ff", label: "Geada" },
  { value: "#8da2bf", label: "Aço" },
  { value: "#d55181", label: "Rosa" },
] as const;

export const PAYMENT_METHODS = [
  { value: "pix", label: "Pix" },
  { value: "transferencia", label: "Transferência" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao", label: "Cartão" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "outro", label: "Outro" },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"];
export const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((m) => m.value) as [PaymentMethodValue, ...PaymentMethodValue[]];

export const RECEIVABLE_KINDS = [
  { value: "mensalidade", label: "Mensalidade" },
  { value: "servico", label: "Serviço avulso" },
  { value: "outro", label: "Outro" },
] as const;

export const kindLabel: Record<string, string> = {
  mensalidade: "Mensalidades",
  servico: "Serviços avulsos",
  outro: "Outras receitas",
};

export type BankAccountOption = { id: string; name: string };
export type CategoryOption = { id: string; name: string; color: string };

/** "2026-10" válido? */
export function isMonth(v: string | undefined | null): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Primeiro nome para mensagens (WhatsApp). Empresas ficam com o nome inteiro. */
export function greetingName(name: string | null | undefined) {
  if (!name) return "";
  if (/\b(ltda|me|eireli|s\.?a\.?|epp)\b/i.test(name)) return name;
  return name.split(/\s+/)[0] ?? name;
}
