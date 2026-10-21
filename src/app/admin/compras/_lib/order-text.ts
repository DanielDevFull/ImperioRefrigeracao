import { formatBRL, formatDate, formatPO, whatsappLink } from "@/lib/format";
import { formatQty } from "../../estoque/_lib/stock-format";

type OrderForText = {
  number: number;
  expectedDate: string | null;
  freight: number;
  total: number;
  notes: string | null;
  supplier: { name: string; contactName: string | null; phone: string | null } | null;
  items: { quantity: number; unitCost: number; product: { name: string; sku: string | null; unit: string } }[];
};

/** Texto do pedido para enviar ao fornecedor (WhatsApp / e-mail). */
export function orderMessage(order: OrderForText, companyName: string, deliveryAddress?: string | null) {
  const greet = order.supplier?.contactName ? `Olá, ${order.supplier.contactName}!` : "Olá!";
  const lines = order.items.map(
    (i) => `• ${formatQty(i.quantity, i.product.unit)} de ${i.product.name}${i.product.sku ? ` (${i.product.sku})` : ""} a ${formatBRL(i.unitCost)}`,
  );
  const parts = [
    `${greet} Segue o pedido de compra ${formatPO(order.number)} da ${companyName}:`,
    "",
    ...lines,
    "",
    `Total dos itens: ${formatBRL(order.total)}`,
  ];
  if (order.freight > 0) parts.push(`Frete: ${formatBRL(order.freight)}`);
  if (order.expectedDate) parts.push(`Entrega prevista: ${formatDate(order.expectedDate)}`);
  if (deliveryAddress) parts.push(`Entregar em: ${deliveryAddress}`);
  if (order.notes) parts.push("", order.notes);
  parts.push("", "Por favor, confirme disponibilidade e prazo. Obrigado!");
  return parts.join("\n");
}

export function orderWhatsappLink(order: OrderForText, companyName: string, deliveryAddress?: string | null) {
  return whatsappLink(order.supplier?.phone, orderMessage(order, companyName, deliveryAddress));
}
