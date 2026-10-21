"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  payables,
  products,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequests,
  stockLocations,
  suppliers,
} from "@/db/schema";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { formatBRL, formatPO } from "@/lib/format";
import { ensureReorderRequests, moveStock, totalStock } from "@/server/stock";
import { formatQty, parseDecimal, round2, round3, weightedAverageCost } from "../../../estoque/_lib/stock-format";
import { lockOrder, recomputeOrderTotal, supplierExpenseCategory } from "../../_lib/orders";

const STAFF = ["admin", "gestor"] as const;

const invalid = (fieldErrors: Record<string, string>): ActionState => ({
  ok: false,
  error: "Revise os campos destacados.",
  fieldErrors,
});

function revalidateOrder(orderId: string, productIds: string[] = []) {
  revalidatePath(`/admin/compras/pedidos/${orderId}`);
  revalidatePath("/admin/compras");
  revalidatePath("/admin/fornecedores");
  revalidatePath("/admin/estoque");
  for (const id of productIds) revalidatePath(`/admin/estoque/${id}`);
}

function assertDraft(order: { status: string; number: number }) {
  if (order.status !== "rascunho")
    throw new Error(`${formatPO(order.number)} já foi enviado. Reabra o pedido para editar os itens.`);
}

/* ──────────────────────── Dados do pedido ──────────────────────── */

const detailsSchema = z.object({
  id: z.uuid(),
  supplierId: z.uuid({ error: "Escolha o fornecedor." }).nullable(),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").nullable(),
  locationId: z.uuid({ error: "Escolha o local de recebimento." }),
  freight: z.number().min(0, "O frete não pode ser negativo."),
  notes: z.string().nullable(),
});

export async function updateOrderDetails(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole([...STAFF]);
  const v = formValues(fd);
  const parsed = detailsSchema.safeParse({
    id: v.str("id") ?? "",
    supplierId: v.str("supplierId"),
    expectedDate: v.str("expectedDate"),
    locationId: v.str("locationId") ?? "",
    freight: v.money("freight") ?? 0,
    notes: v.str("notes"),
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const d = parsed.data;
  const r = await runAction(async () => {
    await db.transaction(async (tx) => {
      const order = await lockOrder(tx, d.id);
      if (order.status === "recebido" || order.status === "cancelado")
        throw new Error(`${formatPO(order.number)} está encerrado e não pode mais ser alterado.`);
      const loc = await tx.query.stockLocations.findFirst({ where: eq(stockLocations.id, d.locationId) });
      if (!loc || !loc.active) throw new Error("Escolha um local de recebimento ativo.");
      const patch: Partial<typeof purchaseOrders.$inferInsert> = {
        expectedDate: d.expectedDate,
        locationId: loc.id,
        freight: round2(d.freight),
        notes: d.notes,
      };
      if (order.status === "rascunho") {
        if (!d.supplierId) throw new Error("Escolha o fornecedor.");
        const s = await tx.query.suppliers.findFirst({ where: eq(suppliers.id, d.supplierId) });
        if (!s) throw new Error("Fornecedor não encontrado.");
        patch.supplierId = s.id;
      }
      if (order.payableId && round2(d.freight) !== order.freight) {
        const p = await tx.query.payables.findFirst({ where: eq(payables.id, order.payableId) });
        if (p && p.status !== "aberto")
          throw new Error("A conta a pagar deste pedido já foi paga ou cancelada; o frete não pode mais mudar.");
        if (p) await tx.update(payables).set({ amount: round2(order.total + d.freight) }).where(eq(payables.id, p.id));
      }
      await tx.update(purchaseOrders).set(patch).where(eq(purchaseOrders.id, order.id));
    });
    return { ok: true, message: "Pedido salvo" };
  });
  if (r.ok) revalidateOrder(d.id);
  return r;
}

/* ───────────────────────────── Itens ───────────────────────────── */

const itemSchema = z.object({
  orderId: z.uuid(),
  productId: z.uuid({ error: "Escolha o produto." }),
  quantity: z.number({ error: "Informe a quantidade." }).positive("A quantidade precisa ser maior que zero."),
  unitCost: z.number({ error: "Informe o custo." }).min(0, "O custo não pode ser negativo."),
});

export async function addOrderItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole([...STAFF]);
  const v = formValues(fd);
  const parsed = itemSchema.safeParse({
    orderId: v.str("orderId") ?? "",
    productId: v.str("productId") ?? "",
    quantity: v.money("quantity"),
    unitCost: v.money("unitCost") ?? 0,
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const d = parsed.data;
  const r = await runAction(async () => {
    const msg = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, d.orderId);
      assertDraft(order);
      const product = await tx.query.products.findFirst({ where: eq(products.id, d.productId) });
      if (!product) throw new Error("Produto não encontrado. Recarregue a página.");
      const existing = order.items.find((i) => i.productId === product.id);
      if (existing) {
        await tx
          .update(purchaseOrderItems)
          .set({ quantity: round3(existing.quantity + d.quantity), unitCost: round2(d.unitCost) })
          .where(eq(purchaseOrderItems.id, existing.id));
      } else {
        await tx.insert(purchaseOrderItems).values({
          purchaseOrderId: order.id,
          productId: product.id,
          quantity: round3(d.quantity),
          unitCost: round2(d.unitCost),
        });
      }
      await recomputeOrderTotal(tx, order.id);
      return existing
        ? `Quantidade de ${product.name} somada ao item existente`
        : `Item adicionado: ${formatQty(d.quantity, product.unit)} de ${product.name}`;
    });
    return { ok: true, message: msg };
  });
  if (r.ok) revalidateOrder(d.orderId);
  return r;
}

const updateItemSchema = z.object({
  itemId: z.uuid(),
  quantity: z.number({ error: "Informe a quantidade." }).positive("A quantidade precisa ser maior que zero."),
  unitCost: z.number({ error: "Informe o custo." }).min(0, "O custo não pode ser negativo."),
});

export async function updateOrderItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole([...STAFF]);
  const v = formValues(fd);
  const parsed = updateItemSchema.safeParse({
    itemId: v.str("itemId") ?? "",
    quantity: v.money("quantity"),
    unitCost: v.money("unitCost") ?? 0,
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const d = parsed.data;
  let orderId = "";
  const r = await runAction(async () => {
    await db.transaction(async (tx) => {
      const item = await tx.query.purchaseOrderItems.findFirst({ where: eq(purchaseOrderItems.id, d.itemId) });
      if (!item) throw new Error("Item não encontrado. Recarregue a página.");
      orderId = item.purchaseOrderId;
      const order = await lockOrder(tx, item.purchaseOrderId);
      assertDraft(order);
      await tx
        .update(purchaseOrderItems)
        .set({ quantity: round3(d.quantity), unitCost: round2(d.unitCost) })
        .where(eq(purchaseOrderItems.id, item.id));
      await recomputeOrderTotal(tx, order.id);
    });
    return { ok: true, message: "Item atualizado" };
  });
  if (r.ok && orderId) revalidateOrder(orderId);
  return r;
}

export async function removeOrderItem(itemId: string): Promise<ActionState> {
  await assertRole([...STAFF]);
  let orderId = "";
  const r = await runAction(async () => {
    await db.transaction(async (tx) => {
      const item = await tx.query.purchaseOrderItems.findFirst({ where: eq(purchaseOrderItems.id, itemId) });
      if (!item) throw new Error("Item não encontrado. Ele pode já ter sido removido.");
      orderId = item.purchaseOrderId;
      const order = await lockOrder(tx, item.purchaseOrderId);
      assertDraft(order);
      await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.id, item.id));
      // a necessidade do produto volta para a fila de solicitações
      await tx
        .update(purchaseRequests)
        .set({ status: "aberta", purchaseOrderId: null })
        .where(
          and(
            eq(purchaseRequests.purchaseOrderId, order.id),
            eq(purchaseRequests.productId, item.productId),
            eq(purchaseRequests.status, "em_pedido"),
          ),
        );
      await recomputeOrderTotal(tx, order.id);
    });
    return { ok: true, message: "Item removido do pedido" };
  });
  if (r.ok && orderId) revalidateOrder(orderId);
  return r;
}

/* ─────────────────────────── Situação ─────────────────────────── */

export async function sendOrder(id: string): Promise<ActionState> {
  await assertRole([...STAFF]);
  const r = await runAction(async () => {
    const number = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      assertDraft(order);
      if (!order.supplier) throw new Error("Escolha o fornecedor antes de enviar o pedido.");
      if (!order.items.length) throw new Error("Adicione pelo menos um item antes de enviar o pedido.");
      await tx
        .update(purchaseOrders)
        .set({ status: "enviado", orderDate: todayISO() })
        .where(eq(purchaseOrders.id, order.id));
      return order.number;
    });
    return { ok: true, message: `${formatPO(number)} marcado como enviado` };
  });
  if (r.ok) revalidateOrder(id);
  return r;
}

export async function reopenOrder(id: string): Promise<ActionState> {
  await assertRole([...STAFF]);
  const r = await runAction(async () => {
    await db.transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      if (order.status !== "enviado" || order.items.some((i) => i.receivedQuantity > 0))
        throw new Error("Só dá para reabrir um pedido enviado que ainda não teve recebimento.");
      await tx.update(purchaseOrders).set({ status: "rascunho" }).where(eq(purchaseOrders.id, order.id));
    });
    return { ok: true, message: "Pedido reaberto para edição" };
  });
  if (r.ok) revalidateOrder(id);
  return r;
}

export async function cancelOrder(id: string): Promise<ActionState> {
  await assertRole([...STAFF]);
  const r = await runAction(async () => {
    const number = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      if (!["rascunho", "enviado"].includes(order.status) || order.items.some((i) => i.receivedQuantity > 0))
        throw new Error("Este pedido já teve mercadoria recebida e não pode ser cancelado.");
      await tx.update(purchaseOrders).set({ status: "cancelado" }).where(eq(purchaseOrders.id, order.id));
      await tx
        .update(purchaseRequests)
        .set({ status: "aberta", purchaseOrderId: null })
        .where(and(eq(purchaseRequests.purchaseOrderId, order.id), eq(purchaseRequests.status, "em_pedido")));
      return order.number;
    });
    return { ok: true, message: `${formatPO(number)} cancelado; as solicitações voltaram para a fila` };
  });
  if (r.ok) revalidateOrder(id);
  return r;
}

/* ─────────────────────────── Recebimento ─────────────────────────── */

const receiveSchema = z.object({
  orderId: z.uuid(),
  locationId: z.uuid({ error: "Escolha onde a mercadoria vai entrar." }),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento da conta a pagar.").nullable(),
  documentNumber: z.string().max(60, "Número muito longo.").nullable(),
  updateCost: z.boolean(),
});

export async function receiveOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole([...STAFF]);
  const v = formValues(fd);
  const parsed = receiveSchema.safeParse({
    orderId: v.str("orderId") ?? "",
    locationId: v.str("locationId") ?? "",
    dueDate: v.str("dueDate"),
    documentNumber: v.str("documentNumber"),
    updateCost: v.bool("updateCost"),
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const d = parsed.data;
  const touched: string[] = [];
  const r = await runAction(async () => {
    const msg = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, d.orderId);
      if (order.status === "rascunho") throw new Error("Marque o pedido como enviado antes de receber a mercadoria.");
      if (order.status === "recebido") throw new Error(`${formatPO(order.number)} já foi recebido por completo.`);
      if (order.status === "cancelado") throw new Error(`${formatPO(order.number)} está cancelado.`);
      const loc = await tx.query.stockLocations.findFirst({ where: eq(stockLocations.id, d.locationId) });
      if (!loc || !loc.active) throw new Error("Escolha um local de estoque ativo para a entrada.");
      if (!order.payableId && !d.dueDate) throw new ReceiveFieldError("dueDate", "Informe o vencimento da conta a pagar.");

      let receivedLines = 0;
      for (const item of order.items) {
        const raw = fd.get(`recv_${item.id}`);
        const q = round3(parseDecimal(raw == null ? null : String(raw)) ?? 0);
        if (q < 0) throw new ReceiveFieldError(`recv_${item.id}`, "A quantidade não pode ser negativa.");
        if (q === 0) continue;
        const remaining = round3(item.quantity - item.receivedQuantity);
        if (q > remaining + 1e-9)
          throw new ReceiveFieldError(
            `recv_${item.id}`,
            `Faltam só ${formatQty(remaining, item.product.unit)} de ${item.product.name}.`,
          );
        const before = (await totalStock(tx, [item.productId])).get(item.productId) ?? 0;
        await moveStock(tx, {
          productId: item.productId,
          locationId: loc.id,
          type: "entrada",
          quantity: q,
          unitCost: item.unitCost,
          purchaseOrderId: order.id,
          notes: `Recebimento do pedido ${formatPO(order.number)}`,
          userId: actor.id,
        });
        if (d.updateCost) {
          const costPrice = weightedAverageCost(before, item.product.costPrice, q, item.unitCost);
          if (costPrice !== item.product.costPrice)
            await tx.update(products).set({ costPrice }).where(eq(products.id, item.productId));
        }
        item.receivedQuantity = round3(item.receivedQuantity + q);
        await tx
          .update(purchaseOrderItems)
          .set({ receivedQuantity: item.receivedQuantity })
          .where(eq(purchaseOrderItems.id, item.id));
        touched.push(item.productId);
        receivedLines++;
      }
      if (!receivedLines) throw new Error("Informe a quantidade recebida de pelo menos um item.");

      const complete = order.items.every((i) => i.receivedQuantity >= i.quantity - 1e-9);
      await tx
        .update(purchaseOrders)
        .set({
          status: complete ? "recebido" : "recebido_parcial",
          receivedAt: complete ? new Date() : order.receivedAt,
          locationId: loc.id,
        })
        .where(eq(purchaseOrders.id, order.id));

      let payableNote = "";
      if (!order.payableId) {
        const category = await supplierExpenseCategory(tx);
        const amount = round2(order.total + order.freight);
        const [payable] = await tx
          .insert(payables)
          .values({
            supplierId: order.supplierId,
            categoryId: category.id,
            description: `Pedido ${formatPO(order.number)} — ${order.supplier?.name ?? "fornecedor"}`,
            documentNumber: d.documentNumber,
            dueDate: d.dueDate!,
            amount,
            purchaseOrderId: order.id,
          })
          .returning({ id: payables.id });
        await tx.update(purchaseOrders).set({ payableId: payable.id }).where(eq(purchaseOrders.id, order.id));
        payableNote = ` Conta a pagar de ${formatBRL(amount)} lançada.`;
      }

      if (complete)
        await tx
          .update(purchaseRequests)
          .set({ status: "atendida" })
          .where(and(eq(purchaseRequests.purchaseOrderId, order.id), eq(purchaseRequests.status, "em_pedido")));

      await ensureReorderRequests(tx, { productIds: touched, userId: actor.id });
      return complete
        ? `Mercadoria recebida: ${formatPO(order.number)} concluído.${payableNote}`
        : `Recebimento parcial registrado em ${loc.name}.${payableNote}`;
    });
    return { ok: true, message: msg };
  });
  if (!r.ok && r.error?.startsWith(FIELD_PREFIX)) {
    const [, field, message] = r.error.split("::");
    return invalid({ [field]: message });
  }
  if (r.ok) revalidateOrder(d.orderId, touched);
  return r;
}

const FIELD_PREFIX = "field::";
class ReceiveFieldError extends Error {
  constructor(field: string, message: string) {
    super(`${FIELD_PREFIX}${field}::${message}`);
  }
}

