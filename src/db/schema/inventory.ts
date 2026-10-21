import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, money, qty, timestamps } from "./_helpers";
import { user } from "./auth";
import {
  purchaseOrderStatusEnum,
  purchaseRequestReasonEnum,
  purchaseRequestStatusEnum,
  stockLocationTypeEnum,
  stockMovementTypeEnum,
} from "./enums";
import { technicians } from "./team";

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  document: text("document"),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku"),
    name: text("name").notNull(),
    /** gas | peca | tubulacao | eletrico | consumivel | ferramenta | outro */
    category: text("category").default("peca").notNull(),
    /** un | kg | m | L | rolo | cx */
    unit: text("unit").default("un").notNull(),
    costPrice: money("cost_price").default(0).notNull(),
    salePrice: money("sale_price").default(0).notNull(),
    /** Ponto de reposição (estoque total abaixo disso gera solicitação de compra) */
    minStock: qty("min_stock").default(0).notNull(),
    /** Quantidade sugerida ao repor */
    reorderQty: qty("reorder_qty").default(0).notNull(),
    preferredSupplierId: uuid("preferred_supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    barcode: text("barcode"),
    active: boolean("active").default(true).notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("products_sku_uq").on(t.sku), index("products_name_idx").on(t.name)],
);

/** Almoxarifado central e estoque embarcado nos veículos dos técnicos. */
export const stockLocations = pgTable("stock_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: stockLocationTypeEnum("type").default("almoxarifado").notNull(),
  technicianId: uuid("technician_id").references(() => technicians.id, { onDelete: "set null" }),
  active: boolean("active").default(true).notNull(),
  createdAt,
});

/** Saldo atual por produto e local (mantido pelas movimentações). */
export const stockLevels = pgTable(
  "stock_levels",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => stockLocations.id, { onDelete: "cascade" }),
    quantity: qty("quantity").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.locationId] })],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => stockLocations.id, { onDelete: "restrict" }),
    type: stockMovementTypeEnum("type").notNull(),
    /** Positivo = entrada no local; negativo = saída */
    quantity: qty("quantity").notNull(),
    unitCost: money("unit_cost").default(0).notNull(),
    workOrderId: uuid("work_order_id"),
    purchaseOrderId: uuid("purchase_order_id"),
    /** Agrupa as duas pernas de uma transferência */
    transferGroupId: uuid("transfer_group_id"),
    notes: text("notes"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt,
  },
  (t) => [
    index("stock_movements_product_idx").on(t.productId),
    index("stock_movements_wo_idx").on(t.workOrderId),
  ],
);

export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: integer("number").generatedAlwaysAsIdentity().notNull(),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  status: purchaseOrderStatusEnum("status").default("rascunho").notNull(),
  orderDate: date("order_date"),
  expectedDate: date("expected_date"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  /** Local que recebe a mercadoria */
  locationId: uuid("location_id").references(() => stockLocations.id, { onDelete: "set null" }),
  freight: money("freight").default(0).notNull(),
  total: money("total").default(0).notNull(),
  payableId: uuid("payable_id"),
  notes: text("notes"),
  createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: qty("quantity").notNull(),
    unitCost: money("unit_cost").default(0).notNull(),
    receivedQuantity: qty("received_quantity").default(0).notNull(),
  },
  (t) => [index("purchase_order_items_po_idx").on(t.purchaseOrderId)],
);

/** Necessidades de compra (geradas por estoque mínimo, falta de material em OM ou manualmente). */
export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: qty("quantity").notNull(),
    reason: purchaseRequestReasonEnum("reason").default("manual").notNull(),
    status: purchaseRequestStatusEnum("status").default("aberta").notNull(),
    workOrderId: uuid("work_order_id"),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("purchase_requests_status_idx").on(t.status)],
);
