"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { products, stockLevels, stockLocations, suppliers, technicians } from "@/db/schema";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { productCategory, productUnit } from "@/lib/labels";
import { defaultLocationFor, ensureReorderRequests, moveStock, totalStock, transferStock } from "@/server/stock";
import { formatQty, round3, weightedAverageCost } from "./_lib/stock-format";

const STAFF = ["admin", "gestor"] as const;

function revalidateStock(productId?: string) {
  revalidatePath("/admin/estoque");
  if (productId) revalidatePath(`/admin/estoque/${productId}`);
  revalidatePath("/admin/compras");
}

const invalid = (fieldErrors: Record<string, string>): ActionState => ({
  ok: false,
  error: "Revise os campos destacados.",
  fieldErrors,
});

async function locationLevel(tx: Tx, productId: string, locationId: string) {
  const row = await tx.query.stockLevels.findFirst({
    where: and(eq(stockLevels.productId, productId), eq(stockLevels.locationId, locationId)),
  });
  return row?.quantity ?? 0;
}

async function requireActiveLocation(tx: Tx, id: string) {
  const loc = await tx.query.stockLocations.findFirst({ where: eq(stockLocations.id, id) });
  if (!loc) throw new Error("Local de estoque não encontrado. Recarregue a página.");
  if (!loc.active) throw new Error(`O local "${loc.name}" está desativado. Reative-o ou escolha outro.`);
  return loc;
}

async function requireProduct(tx: Tx, id: string) {
  const p = await tx.query.products.findFirst({ where: eq(products.id, id) });
  if (!p) throw new Error("Produto não encontrado. Recarregue a página.");
  return p;
}

/* ───────────────────────── Produtos ───────────────────────── */

const productSchema = z.object({
  sku: z.string().max(40, "Use até 40 caracteres.").nullable(),
  name: z.string({ error: "Informe o nome do produto." }).min(2, "Informe o nome do produto."),
  category: z.enum(Object.keys(productCategory) as [string, ...string[]], { error: "Escolha a categoria." }),
  unit: z.enum(Object.keys(productUnit) as [string, ...string[]], { error: "Escolha a unidade." }),
  costPrice: z.number({ error: "Informe o custo." }).min(0, "O custo não pode ser negativo."),
  salePrice: z.number().min(0, "O preço de venda não pode ser negativo."),
  minStock: z.number().min(0, "O mínimo não pode ser negativo."),
  reorderQty: z.number().min(0, "A reposição não pode ser negativa."),
  preferredSupplierId: z.uuid().nullable(),
  barcode: z.string().max(64, "Código de barras muito longo.").nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  initialQty: z.number().min(0, "O saldo inicial não pode ser negativo.").nullable(),
  initialLocationId: z.uuid().nullable(),
});

export async function saveProduct(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole([...STAFF]);
  const v = formValues(fd);
  const id = v.str("id");
  const parsed = productSchema.safeParse({
    sku: v.str("sku")?.toUpperCase() ?? null,
    name: v.str("name") ?? "",
    category: v.str("category") ?? "",
    unit: v.str("unit") ?? "",
    costPrice: v.money("costPrice") ?? 0,
    salePrice: v.money("salePrice") ?? 0,
    minStock: v.money("minStock") ?? 0,
    reorderQty: v.money("reorderQty") ?? 0,
    preferredSupplierId: v.str("preferredSupplierId"),
    barcode: v.str("barcode"),
    notes: v.str("notes"),
    active: id ? v.bool("active") : true,
    initialQty: id ? null : v.money("initialQty"),
    initialLocationId: id ? null : v.str("initialLocationId"),
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const { initialQty, initialLocationId, ...data } = parsed.data;

  if (data.sku) {
    const dup = await db.query.products.findFirst({
      where: and(eq(products.sku, data.sku), id ? ne(products.id, id) : undefined),
      columns: { id: true, name: true },
    });
    if (dup) return invalid({ sku: `O SKU ${data.sku} já é usado por "${dup.name}". Escolha outro.` });
  }

  let savedId: string | null = id;
  const result = await runAction(async () => {
    savedId = await db.transaction(async (tx) => {
      if (data.preferredSupplierId) {
        const s = await tx.query.suppliers.findFirst({ where: eq(suppliers.id, data.preferredSupplierId) });
        if (!s) throw new Error("Fornecedor não encontrado. Recarregue a página.");
      }
      if (id) {
        const before = await tx.query.products.findFirst({ where: eq(products.id, id), columns: { minStock: true } });
        if (!before) throw new Error("Produto não encontrado. Ele pode ter sido removido.");
        await tx.update(products).set(data).where(eq(products.id, id));
        // mínimo alterado: se o saldo ficou abaixo, já abre a solicitação de compra
        if (data.active && data.minStock !== before.minStock)
          await ensureReorderRequests(tx, { productIds: [id], userId: actor.id });
        return id;
      }
      const [row] = await tx.insert(products).values(data).returning({ id: products.id });
      if (initialQty && initialQty > 0) {
        const loc = initialLocationId ? await requireActiveLocation(tx, initialLocationId) : await defaultLocationFor(tx);
        await moveStock(tx, {
          productId: row.id,
          locationId: loc.id,
          type: "entrada",
          quantity: round3(initialQty),
          unitCost: data.costPrice,
          notes: "Saldo inicial do cadastro",
          userId: actor.id,
        });
        await ensureReorderRequests(tx, { productIds: [row.id], userId: actor.id });
      }
      return row.id;
    });
  });
  if (!result.ok) return result;
  revalidateStock(savedId ?? undefined);
  if (!id && savedId) redirect(`/admin/estoque/${savedId}?criado=1`);
  return { ok: true, message: "Produto salvo", id: savedId ?? undefined };
}

export async function setProductActive(id: string, active: boolean): Promise<ActionState> {
  await assertRole([...STAFF]);
  return runAction(async () => {
    const [row] = await db.update(products).set({ active }).where(eq(products.id, id)).returning({ id: products.id });
    if (!row) throw new Error("Produto não encontrado.");
    revalidateStock(id);
    return { ok: true, message: active ? "Produto reativado" : "Produto desativado" };
  });
}

/* ─────────────────────── Movimentações ─────────────────────── */

const entrySchema = z.object({
  productId: z.uuid({ error: "Escolha o produto." }),
  locationId: z.uuid({ error: "Escolha o local." }),
  quantity: z.number({ error: "Informe a quantidade." }).positive("A quantidade precisa ser maior que zero."),
  unitCost: z.number({ error: "Informe o custo unitário." }).min(0, "O custo não pode ser negativo."),
  notes: z.string().nullable(),
  updateCost: z.boolean(),
});

export async function registerEntry(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole([...STAFF]);
  const v = formValues(fd);
  const parsed = entrySchema.safeParse({
    productId: v.str("productId") ?? "",
    locationId: v.str("locationId") ?? "",
    quantity: v.money("quantity"),
    unitCost: v.money("unitCost") ?? 0,
    notes: v.str("notes"),
    updateCost: v.bool("updateCost"),
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const d = parsed.data;
  return runAction(async () => {
    const msg = await db.transaction(async (tx) => {
      const product = await requireProduct(tx, d.productId);
      const loc = await requireActiveLocation(tx, d.locationId);
      const quantity = round3(d.quantity);
      const before = (await totalStock(tx, [product.id])).get(product.id) ?? 0;
      await moveStock(tx, {
        productId: product.id,
        locationId: loc.id,
        type: "entrada",
        quantity,
        unitCost: d.unitCost,
        notes: d.notes,
        userId: actor.id,
      });
      if (d.updateCost) {
        const costPrice = weightedAverageCost(before, product.costPrice, quantity, d.unitCost);
        if (costPrice !== product.costPrice) await tx.update(products).set({ costPrice }).where(eq(products.id, product.id));
      }
      await ensureReorderRequests(tx, { productIds: [product.id], userId: actor.id });
      return `Entrada registrada: ${formatQty(quantity, product.unit)} em ${loc.name}`;
    });
    revalidateStock(d.productId);
    return { ok: true, message: msg };
  });
}

const adjustSchema = z
  .object({
    productId: z.uuid({ error: "Escolha o produto." }),
    locationId: z.uuid({ error: "Escolha o local." }),
    mode: z.enum(["contagem", "saida"]),
    counted: z.number().min(0, "A contagem não pode ser negativa.").nullable(),
    quantity: z.number().positive("A quantidade precisa ser maior que zero.").nullable(),
    reason: z.string({ error: "Explique o motivo do ajuste." }).min(3, "Explique o motivo do ajuste."),
  })
  .superRefine((d, ctx) => {
    if (d.mode === "contagem" && d.counted == null)
      ctx.addIssue({ code: "custom", path: ["counted"], message: "Informe a quantidade contada." });
    if (d.mode === "saida" && d.quantity == null)
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Informe a quantidade que saiu." });
  });

export async function registerAdjustment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole([...STAFF]);
  const v = formValues(fd);
  const parsed = adjustSchema.safeParse({
    productId: v.str("productId") ?? "",
    locationId: v.str("locationId") ?? "",
    mode: v.str("mode") ?? "contagem",
    counted: v.money("counted"),
    quantity: v.money("quantity"),
    reason: v.str("reason") ?? "",
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const d = parsed.data;
  return runAction(async () => {
    const msg = await db.transaction(async (tx) => {
      const product = await requireProduct(tx, d.productId);
      const loc = await requireActiveLocation(tx, d.locationId);
      const current = await locationLevel(tx, product.id, loc.id);
      let delta: number;
      if (d.mode === "contagem") {
        delta = round3((d.counted ?? 0) - current);
        if (delta === 0)
          throw new Error(`A contagem é igual ao saldo atual (${formatQty(current, product.unit)}). Nada a ajustar.`);
      } else {
        const q = round3(d.quantity ?? 0);
        if (q > current + 1e-9)
          throw new Error(
            `Saldo insuficiente em ${loc.name}: há ${formatQty(current, product.unit)}. Use "Ajuste de contagem" se o saldo estiver errado.`,
          );
        delta = -q;
      }
      await moveStock(tx, {
        productId: product.id,
        locationId: loc.id,
        type: d.mode === "contagem" ? "ajuste" : "saida",
        quantity: delta,
        unitCost: product.costPrice,
        notes: d.reason,
        userId: actor.id,
      });
      await ensureReorderRequests(tx, { productIds: [product.id], userId: actor.id });
      return d.mode === "contagem"
        ? `Ajuste registrado: saldo em ${loc.name} agora é ${formatQty(round3(current + delta), product.unit)}`
        : `Saída registrada: ${formatQty(-delta, product.unit)} de ${loc.name}`;
    });
    revalidateStock(d.productId);
    return { ok: true, message: msg };
  });
}

const transferSchema = z
  .object({
    productId: z.uuid({ error: "Escolha o produto." }),
    fromId: z.uuid({ error: "Escolha a origem." }),
    toId: z.uuid({ error: "Escolha o destino." }),
    quantity: z.number({ error: "Informe a quantidade." }).positive("A quantidade precisa ser maior que zero."),
    notes: z.string().nullable(),
  })
  .refine((d) => d.fromId !== d.toId, { path: ["toId"], message: "Origem e destino precisam ser diferentes." });

export async function registerTransfer(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertRole([...STAFF]);
  const v = formValues(fd);
  const parsed = transferSchema.safeParse({
    productId: v.str("productId") ?? "",
    fromId: v.str("fromId") ?? "",
    toId: v.str("toId") ?? "",
    quantity: v.money("quantity"),
    notes: v.str("notes"),
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const d = parsed.data;
  return runAction(async () => {
    const msg = await db.transaction(async (tx) => {
      const product = await requireProduct(tx, d.productId);
      const from = await requireActiveLocation(tx, d.fromId);
      const to = await requireActiveLocation(tx, d.toId);
      const quantity = round3(d.quantity);
      const available = await locationLevel(tx, product.id, from.id);
      if (quantity > available + 1e-9)
        throw new Error(
          `Saldo insuficiente em ${from.name}: há ${formatQty(available, product.unit)}. Registre uma entrada ou ajuste antes.`,
        );
      await transferStock(tx, {
        productId: product.id,
        fromId: from.id,
        toId: to.id,
        quantity,
        userId: actor.id,
        notes: d.notes ?? `${from.name} para ${to.name}`,
      });
      await ensureReorderRequests(tx, { productIds: [product.id], userId: actor.id });
      return `Transferência registrada: ${formatQty(quantity, product.unit)} para ${to.name}`;
    });
    revalidateStock(d.productId);
    return { ok: true, message: msg };
  });
}

/* ───────────────────────── Locais ───────────────────────── */

const locationSchema = z
  .object({
    name: z.string({ error: "Dê um nome ao local." }).min(2, "Dê um nome ao local."),
    type: z.enum(["almoxarifado", "veiculo"], { error: "Escolha o tipo." }),
    technicianId: z.uuid().nullable(),
  })
  .refine((d) => d.type !== "veiculo" || d.technicianId, {
    path: ["technicianId"],
    message: "Escolha o técnico responsável pelo veículo.",
  });

export async function saveLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await assertRole([...STAFF]);
  const v = formValues(fd);
  const id = v.str("id");
  const parsed = locationSchema.safeParse({
    name: v.str("name") ?? "",
    type: v.str("type") ?? "",
    technicianId: v.str("technicianId"),
  });
  if (!parsed.success) return invalid(zodFieldErrors(parsed.error));
  const d = parsed.data;
  const technicianId = d.type === "veiculo" ? d.technicianId : null;
  const r = await runAction(async () => {
    await db.transaction(async (tx) => {
      if (technicianId) {
        const tech = await tx.query.technicians.findFirst({ where: eq(technicians.id, technicianId) });
        if (!tech) throw new Error("Técnico não encontrado. Recarregue a página.");
        const other = await tx.query.stockLocations.findFirst({
          where: and(
            eq(stockLocations.technicianId, technicianId),
            eq(stockLocations.active, true),
            id ? ne(stockLocations.id, id) : undefined,
          ),
        });
        if (other)
          throw new Error(`${tech.name} já tem o local "${other.name}". Desative-o antes de vincular outro veículo.`);
      }
      if (id) {
        const current = await tx.query.stockLocations.findFirst({ where: eq(stockLocations.id, id) });
        if (!current) throw new Error("Local não encontrado.");
        if (current.type === "almoxarifado" && d.type !== "almoxarifado") await assertAnotherWarehouse(tx, id);
        await tx.update(stockLocations).set({ name: d.name, type: d.type, technicianId }).where(eq(stockLocations.id, id));
      } else {
        await tx.insert(stockLocations).values({ name: d.name, type: d.type, technicianId });
      }
    });
    return { ok: true, message: id ? "Local salvo" : "Local criado" };
  });
  if (r.ok) revalidatePath("/admin/estoque");
  return r;
}

async function assertAnotherWarehouse(tx: Tx, exceptId: string) {
  const other = await tx.query.stockLocations.findFirst({
    where: and(eq(stockLocations.type, "almoxarifado"), eq(stockLocations.active, true), ne(stockLocations.id, exceptId)),
  });
  if (!other) throw new Error("É preciso manter pelo menos um almoxarifado ativo para receber compras.");
}

export async function setLocationActive(id: string, active: boolean): Promise<ActionState> {
  await assertRole([...STAFF]);
  return runAction(async () => {
    await db.transaction(async (tx) => {
      const loc = await tx.query.stockLocations.findFirst({ where: eq(stockLocations.id, id) });
      if (!loc) throw new Error("Local não encontrado.");
      if (!active) {
        if (loc.type === "almoxarifado") await assertAnotherWarehouse(tx, id);
        const withStock = await tx.query.stockLevels.findFirst({
          where: and(eq(stockLevels.locationId, id), ne(stockLevels.quantity, 0)),
        });
        if (withStock)
          throw new Error(`"${loc.name}" ainda tem saldo. Transfira os itens para outro local antes de desativar.`);
      } else if (loc.technicianId) {
        const other = await tx.query.stockLocations.findFirst({
          where: and(eq(stockLocations.technicianId, loc.technicianId), eq(stockLocations.active, true), ne(stockLocations.id, id)),
        });
        if (other) throw new Error(`O técnico já tem o local ativo "${other.name}". Desative-o antes.`);
      }
      await tx.update(stockLocations).set({ active }).where(eq(stockLocations.id, id));
    });
    revalidatePath("/admin/estoque");
    return { ok: true, message: active ? "Local reativado" : "Local desativado" };
  });
}
