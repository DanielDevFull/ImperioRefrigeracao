/**
 * Rótulos em português e tons visuais dos estados do sistema.
 * Tom → cor: ice (em andamento), frost (neutro/agendado), mint (ok), brass (atenção),
 * red (problema), steel (inativo).
 */
export type Tone = "ice" | "frost" | "mint" | "brass" | "red" | "steel" | "violet";

type LabelMap = Record<string, { label: string; tone: Tone }>;

export const workOrderStatus: LabelMap = {
  aberta: { label: "Aberta", tone: "frost" },
  agendada: { label: "Agendada", tone: "violet" },
  em_deslocamento: { label: "A caminho", tone: "ice" },
  em_execucao: { label: "Em execução", tone: "ice" },
  pausada: { label: "Pausada", tone: "brass" },
  aguardando_material: { label: "Aguardando material", tone: "brass" },
  concluida: { label: "Concluída", tone: "mint" },
  cancelada: { label: "Cancelada", tone: "steel" },
};

export const workOrderStatusOrder = [
  "aberta",
  "agendada",
  "em_deslocamento",
  "em_execucao",
  "pausada",
  "aguardando_material",
  "concluida",
  "cancelada",
] as const;

export const activeWorkOrderStatuses = [
  "aberta",
  "agendada",
  "em_deslocamento",
  "em_execucao",
  "pausada",
  "aguardando_material",
] as const;

export const workOrderType: LabelMap = {
  preventiva: { label: "Preventiva", tone: "ice" },
  corretiva: { label: "Corretiva", tone: "red" },
  instalacao: { label: "Instalação", tone: "violet" },
  visita_tecnica: { label: "Visita técnica", tone: "frost" },
  pmoc: { label: "PMOC", tone: "mint" },
};

export const workOrderOrigin: LabelMap = {
  automatica: { label: "Automática", tone: "ice" },
  manual: { label: "Manual", tone: "frost" },
  portal_cliente: { label: "Portal do cliente", tone: "violet" },
};

export const priority: LabelMap = {
  baixa: { label: "Baixa", tone: "steel" },
  normal: { label: "Normal", tone: "frost" },
  alta: { label: "Alta", tone: "brass" },
  urgente: { label: "Urgente", tone: "red" },
};

export const equipmentStatus: LabelMap = {
  ativo: { label: "Ativo", tone: "mint" },
  inativo: { label: "Inativo", tone: "steel" },
  em_manutencao: { label: "Em manutenção", tone: "brass" },
  removido: { label: "Removido", tone: "steel" },
};

export const contractStatus: LabelMap = {
  ativo: { label: "Ativo", tone: "mint" },
  suspenso: { label: "Suspenso", tone: "brass" },
  cancelado: { label: "Cancelado", tone: "steel" },
  encerrado: { label: "Encerrado", tone: "steel" },
};

/** Inclui o estado calculado "vencido". */
export const receivableStatus: LabelMap = {
  aberto: { label: "Em aberto", tone: "frost" },
  vencido: { label: "Vencido", tone: "red" },
  em_analise: { label: "Comprovante em análise", tone: "brass" },
  pago: { label: "Pago", tone: "mint" },
  cancelado: { label: "Cancelado", tone: "steel" },
};

export const payableStatus: LabelMap = {
  aberto: { label: "Em aberto", tone: "frost" },
  vencido: { label: "Vencido", tone: "red" },
  pago: { label: "Pago", tone: "mint" },
  cancelado: { label: "Cancelado", tone: "steel" },
};

export const paymentMethod: LabelMap = {
  pix: { label: "Pix", tone: "mint" },
  boleto: { label: "Boleto", tone: "frost" },
  cartao: { label: "Cartão", tone: "violet" },
  dinheiro: { label: "Dinheiro", tone: "brass" },
  transferencia: { label: "Transferência", tone: "ice" },
  outro: { label: "Outro", tone: "steel" },
};

export const commissionStatus: LabelMap = {
  pendente: { label: "Prevista", tone: "frost" },
  aprovada: { label: "Liberada", tone: "ice" },
  paga: { label: "Paga", tone: "mint" },
  cancelada: { label: "Cancelada", tone: "steel" },
};

export const commissionBasis: Record<string, { label: string; tone: Tone; hint: string }> = {
  percentual_mao_de_obra: {
    label: "% da mão de obra",
    tone: "ice",
    hint: "Percentual sobre a mão de obra (ou valor de referência da visita do plano).",
  },
  percentual_total: {
    label: "% do total da OM",
    tone: "violet",
    hint: "Percentual sobre mão de obra + materiais cobrados do cliente.",
  },
  percentual_materiais: {
    label: "% dos materiais",
    tone: "brass",
    hint: "Percentual sobre os materiais cobrados do cliente.",
  },
  fixo_por_om: { label: "Valor fixo por OM", tone: "mint", hint: "Valor em R$ por OM concluída." },
};

export const purchaseOrderStatus: LabelMap = {
  rascunho: { label: "Rascunho", tone: "steel" },
  enviado: { label: "Enviado", tone: "ice" },
  recebido_parcial: { label: "Recebido parcialmente", tone: "brass" },
  recebido: { label: "Recebido", tone: "mint" },
  cancelado: { label: "Cancelado", tone: "steel" },
};

export const purchaseRequestStatus: LabelMap = {
  aberta: { label: "Aberta", tone: "brass" },
  em_pedido: { label: "Em pedido", tone: "ice" },
  atendida: { label: "Atendida", tone: "mint" },
  cancelada: { label: "Cancelada", tone: "steel" },
};

export const purchaseRequestReason: LabelMap = {
  estoque_minimo: { label: "Estoque mínimo", tone: "brass" },
  om: { label: "Falta em OM", tone: "red" },
  manual: { label: "Manual", tone: "frost" },
};

export const stockMovementType: LabelMap = {
  entrada: { label: "Entrada", tone: "mint" },
  saida: { label: "Saída", tone: "red" },
  ajuste: { label: "Ajuste", tone: "brass" },
  transferencia: { label: "Transferência", tone: "ice" },
  consumo_om: { label: "Consumo em OM", tone: "violet" },
  estorno_om: { label: "Estorno de OM", tone: "frost" },
};

export const productCategory: Record<string, string> = {
  gas: "Gás refrigerante",
  peca: "Peça",
  tubulacao: "Tubulação",
  eletrico: "Elétrico",
  consumivel: "Consumível",
  ferramenta: "Ferramenta",
  outro: "Outro",
};

export const productUnit: Record<string, string> = {
  un: "unidade",
  kg: "kg",
  m: "metro",
  L: "litro",
  rolo: "rolo",
  cx: "caixa",
};

export const frequencyMonths: Record<number, string> = {
  1: "Mensal",
  2: "Bimestral",
  3: "Trimestral",
  4: "Quadrimestral",
  6: "Semestral",
  12: "Anual",
};

export const refrigerants = ["R-410A", "R-32", "R-22", "R-134a", "R-404A", "R-290", "R-407C", "R-600a"];

export const roleLabel: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  tecnico: "Técnico",
  cliente: "Cliente",
};

export function labelOf(map: LabelMap, key: string | null | undefined) {
  if (!key) return { label: "—", tone: "steel" as Tone };
  return map[key] ?? { label: key, tone: "steel" as Tone };
}

/** Status efetivo de uma conta (aberto + vencimento passado = vencido). */
export function effectiveFinanceStatus(status: string, dueDate: string, today: string) {
  if (status === "aberto" && dueDate < today) return "vencido";
  return status;
}
