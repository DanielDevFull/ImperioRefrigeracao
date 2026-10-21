import { pgEnum } from "drizzle-orm/pg-core";

export const personTypeEnum = pgEnum("person_type", ["pf", "pj"]);

export const customerStatusEnum = pgEnum("customer_status", ["ativo", "inativo"]);

export const equipmentStatusEnum = pgEnum("equipment_status", [
  "ativo",
  "inativo",
  "em_manutencao",
  "removido",
]);

export const contractStatusEnum = pgEnum("contract_status", [
  "ativo",
  "suspenso",
  "cancelado",
  "encerrado",
]);

export const workOrderTypeEnum = pgEnum("work_order_type", [
  "preventiva",
  "corretiva",
  "instalacao",
  "visita_tecnica",
  "pmoc",
]);

export const workOrderOriginEnum = pgEnum("work_order_origin", [
  "automatica",
  "manual",
  "portal_cliente",
]);

/**
 * Fluxo da OM:
 * aberta → agendada → em_deslocamento → em_execucao ⇄ pausada → concluida
 * aguardando_material pode acontecer a partir de qualquer estado ativo.
 * cancelada encerra sem execução.
 */
export const workOrderStatusEnum = pgEnum("work_order_status", [
  "aberta",
  "agendada",
  "em_deslocamento",
  "em_execucao",
  "pausada",
  "aguardando_material",
  "concluida",
  "cancelada",
]);

export const priorityEnum = pgEnum("priority", ["baixa", "normal", "alta", "urgente"]);

export const photoKindEnum = pgEnum("photo_kind", ["antes", "depois", "problema", "outro"]);

export const stockLocationTypeEnum = pgEnum("stock_location_type", ["almoxarifado", "veiculo"]);

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "entrada",
  "saida",
  "ajuste",
  "transferencia",
  "consumo_om",
  "estorno_om",
]);

export const purchaseRequestReasonEnum = pgEnum("purchase_request_reason", [
  "estoque_minimo",
  "om",
  "manual",
]);

export const purchaseRequestStatusEnum = pgEnum("purchase_request_status", [
  "aberta",
  "em_pedido",
  "atendida",
  "cancelada",
]);

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "rascunho",
  "enviado",
  "recebido_parcial",
  "recebido",
  "cancelado",
]);

export const receivableKindEnum = pgEnum("receivable_kind", ["mensalidade", "servico", "outro"]);

/** "vencido" não é armazenado: é calculado por due_date < hoje enquanto status = aberto. */
export const receivableStatusEnum = pgEnum("receivable_status", [
  "aberto",
  "em_analise",
  "pago",
  "cancelado",
]);

export const payableStatusEnum = pgEnum("payable_status", ["aberto", "pago", "cancelado"]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "pix",
  "boleto",
  "cartao",
  "dinheiro",
  "transferencia",
  "outro",
]);

export const financeCategoryTypeEnum = pgEnum("finance_category_type", ["receita", "despesa"]);

export const commissionBasisEnum = pgEnum("commission_basis", [
  /** % sobre o valor de mão de obra / referência da OM */
  "percentual_mao_de_obra",
  /** % sobre o total cobrado (mão de obra + materiais cobrados) */
  "percentual_total",
  /** % sobre materiais cobrados do cliente */
  "percentual_materiais",
  /** valor fixo por OM concluída */
  "fixo_por_om",
]);

export const commissionStatusEnum = pgEnum("commission_status", [
  "pendente",
  "aprovada",
  "paga",
  "cancelada",
]);

export const payoutStatusEnum = pgEnum("payout_status", ["aberto", "pago", "cancelado"]);

export const userRoleValues = ["admin", "gestor", "tecnico", "cliente"] as const;
export type UserRole = (typeof userRoleValues)[number];
