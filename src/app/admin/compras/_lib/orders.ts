import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { financeCategories, purchaseOrderItems, purchaseOrders } from "@/db/schema";

export const PAYABLE_CATEGORY = "Fornecedores / peças";

/** Recalcula o total do pedido (soma dos itens, sem frete). */
export async function recomputeOrderTotal(tx: Tx, orderId: string) {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(round(sum(${purchaseOrderItems.quantity} * ${purchaseOrderItems.unitCost}), 2), 0)::float8` })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, orderId));
  const total = Number(row?.total ?? 0);
  await tx.update(purchaseOrders).set({ total }).where(eq(purchaseOrders.id, orderId));
  return total;
}

/** Categoria de despesa usada nas contas a pagar de compras (cria se não existir). */
export async function supplierExpenseCategory(tx: Tx) {
  const found = await tx.query.financeCategories.findFirst({
    where: and(eq(financeCategories.name, PAYABLE_CATEGORY), eq(financeCategories.type, "despesa")),
  });
  if (found) return found;
  const [created] = await tx
    .insert(financeCategories)
    .values({ name: PAYABLE_CATEGORY, type: "despesa", color: "#e8b04b" })
    .returning();
  return created;
}

export async function lockOrder(tx: Tx, id: string) {
  // bloqueia a linha para evitar dois recebimentos simultâneos
  await tx.execute(sql`select 1 from ${purchaseOrders} where ${purchaseOrders.id} = ${id} for update`);
  const order = await tx.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, id),
    with: { supplier: true, items: { with: { product: true } } },
  });
  if (!order) throw new Error("Pedido não encontrado. Ele pode ter sido removido.");
  return order;
}
