"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { products, purchaseOrderItems, purchaseOrders, purchaseRequests, suppliers } from "@/db/schema";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { getSettings } from "@/server/settings";
import { defaultLocationFor, ensureForecastRequests, ensureReorderRequests } from "@/server/stock";
import { round2, round3 } from "../estoque/_lib/stock-format";
import { recomputeOrderTotal } from "./_lib/orders";

const STAFF = ["admin", "gestor"] as const;

const invalid = (fieldErrors: Record<string, string>): ActionState => ({
  ok: false,
  error: "Revise os campos destacados.",
  fieldErrors,
});

function revalidatePurchases(orderId?: string) {
  revalidatePath("/admin/compras");
  revalidatePath("/admin/estoque");
  revalidatePath("/admin/fornecedores");
  if (orderId) revalidatePath(`/admin/compras/pedidos/${orderId}`);
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .nullable();

/* ─────────────────────── Solicitações ─────────────────────── */

const requestSchema = z.object({
  productId: z.uuid({ error: "Escolha o produto." }),
  quantity: z.number({ error: "Informe a quantidade." }).positive("A quantidade precisa ser maior que zero."),
  notes: z.string().nullable(),
});

export async function createRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole([...STAFF]);
  const v = formValues(fd);
  const parsed = requestSchema.safeParse({
    productId: v.str("productId") ?? "",
    quantity: v.money("quantity"),
    notes: v.str("notes"),
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const d = parsed.data;
  return runAction(async () => {
    const product = await db.query.products.findFirst({ where: eq(products.id, d.productId) });
    if (!product) throw new Error("Produto não encontrado. Recarregue a página.");
    if (!product.active) throw new Error("Este produto está inativo. Reative-o no estoque antes de pedir compra.");
    await db.insert(purchaseRequests).values({
      productId: d.productId,
      quantity: round3(d.quantity),
      reason: "manual",
      notes: d.notes,
      createdById: actor.id,
    });
    revalidatePurchases();
    revalidatePath(`/admin/estoque/${d.productId}`);
    return { ok: true, message: "Solicitação criada" };
  });
}

export async function cancelRequest(id: string): Promise<ActionState> {
  await assertRole([...STAFF]);
  return runAction(async () => {
    const [row] = await db
      .update(purchaseRequests)
      .set({ status: "cancelada" })
      .where(and(eq(purchaseRequests.id, id), eq(purchaseRequests.status, "aberta")))
      .returning({ productId: purchaseRequests.productId });
    if (!row) throw new Error("Só dá para cancelar solicitações abertas (as que estão em pedido saem cancelando o pedido).");
    revalidatePurchases();
    revalidatePath(`/admin/estoque/${row.productId}`);
    return { ok: true, message: "Solicitação cancelada" };
  });
}

export async function generateSuggestions(): Promise<ActionState> {
  const actor = await assertRole([...STAFF]);
  return runAction(async () => {
    const settings = await getSettings();
    const { reorder, forecast } = await db.transaction(async (tx) => ({
      reorder: await ensureReorderRequests(tx, { userId: actor.id }),
      forecast: await ensureForecastRequests(tx, settings.workOrderHorizonDays),
    }));
    revalidatePurchases();
    const created = reorder + forecast;
    if (!created) return { ok: true, message: "Nenhuma nova necessidade: estoque e previsão já estão cobertos." };
    const parts = [
      reorder ? `${reorder} por estoque mínimo` : null,
      forecast ? `${forecast} pela previsão das OMs` : null,
    ].filter(Boolean);
    return {
      ok: true,
      message: `${created} ${created === 1 ? "solicitação criada" : "solicitações criadas"} (${parts.join(" e ")}).`,
    };
  });
}

/* ───────────────────────── Pedidos ───────────────────────── */

const fromRequestsSchema = z.object({
  requestIds: z.array(z.uuid()).min(1, "Selecione ao menos uma solicitação."),
  supplierId: z.uuid({ error: "Escolha o fornecedor." }),
  expectedDate: isoDate,
  notes: z.string().nullable(),
});

export async function createOrderFromRequests(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole([...STAFF]);
  const v = formValues(fd);
  const parsed = fromRequestsSchema.safeParse({
    requestIds: v.all("requestId"),
    supplierId: v.str("supplierId") ?? "",
    expectedDate: v.str("expectedDate"),
    notes: v.str("notes"),
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const d = parsed.data;
  let orderId: string | null = null;
  const r = await runAction(async () => {
    orderId = await db.transaction(async (tx) => {
      const supplier = await tx.query.suppliers.findFirst({ where: eq(suppliers.id, d.supplierId) });
      if (!supplier) throw new Error("Fornecedor não encontrado. Recarregue a página.");
      if (!supplier.active) throw new Error(`${supplier.name} está inativo. Reative o fornecedor ou escolha outro.`);
      const requests = await tx.query.purchaseRequests.findMany({
        where: and(inArray(purchaseRequests.id, d.requestIds), eq(purchaseRequests.status, "aberta")),
        with: { product: true },
      });
      if (requests.length !== d.requestIds.length)
        throw new Error("Alguma solicitação selecionada já entrou em outro pedido ou foi cancelada. Recarregue a página.");
      const location = await defaultLocationFor(tx);
      const [order] = await tx
        .insert(purchaseOrders)
        .values({
          supplierId: supplier.id,
          expectedDate: d.expectedDate,
          locationId: location.id,
          notes: d.notes,
          createdById: actor.id,
        })
        .returning({ id: purchaseOrders.id });
      // um item por produto, somando as solicitações repetidas
      const byProduct = new Map<string, { quantity: number; unitCost: number }>();
      for (const req of requests) {
        const cur = byProduct.get(req.productId);
        byProduct.set(req.productId, {
          quantity: round3((cur?.quantity ?? 0) + req.quantity),
          unitCost: req.product.costPrice,
        });
      }
      await tx.insert(purchaseOrderItems).values(
        [...byProduct.entries()].map(([productId, it]) => ({
          purchaseOrderId: order.id,
          productId,
          quantity: it.quantity,
          unitCost: round2(it.unitCost),
        })),
      );
      await tx
        .update(purchaseRequests)
        .set({ status: "em_pedido", purchaseOrderId: order.id })
        .where(inArray(purchaseRequests.id, d.requestIds));
      await recomputeOrderTotal(tx, order.id);
      return order.id;
    });
  });
  if (!r.ok) return r;
  revalidatePurchases(orderId ?? undefined);
  redirect(`/admin/compras/pedidos/${orderId}?criado=1`);
}

const orderSchema = z.object({
  supplierId: z.uuid({ error: "Escolha o fornecedor." }),
  expectedDate: isoDate,
  notes: z.string().nullable(),
});

export async function createOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole([...STAFF]);
  const v = formValues(fd);
  const parsed = orderSchema.safeParse({
    supplierId: v.str("supplierId") ?? "",
    expectedDate: v.str("expectedDate"),
    notes: v.str("notes"),
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const d = parsed.data;
  let orderId: string | null = null;
  const r = await runAction(async () => {
    orderId = await db.transaction(async (tx) => {
      const supplier = await tx.query.suppliers.findFirst({ where: eq(suppliers.id, d.supplierId) });
      if (!supplier) throw new Error("Fornecedor não encontrado. Recarregue a página.");
      if (!supplier.active) throw new Error(`${supplier.name} está inativo. Reative o fornecedor ou escolha outro.`);
      const location = await defaultLocationFor(tx);
      const [order] = await tx
        .insert(purchaseOrders)
        .values({ supplierId: supplier.id, expectedDate: d.expectedDate, notes: d.notes, locationId: location.id, createdById: actor.id })
        .returning({ id: purchaseOrders.id });
      return order.id;
    });
  });
  if (!r.ok) return r;
  revalidatePurchases(orderId ?? undefined);
  redirect(`/admin/compras/pedidos/${orderId}?criado=1`);
}
