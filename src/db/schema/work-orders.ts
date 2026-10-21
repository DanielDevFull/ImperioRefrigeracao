import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, money, qty, timestamps } from "./_helpers";
import { user } from "./auth";
import { customerSites, customers, equipment } from "./customers";
import {
  photoKindEnum,
  priorityEnum,
  workOrderOriginEnum,
  workOrderStatusEnum,
  workOrderTypeEnum,
} from "./enums";
import { products, stockLocations } from "./inventory";
import { contractEquipment, maintenancePlanTasks, maintenancePlans } from "./maintenance";
import { technicians } from "./team";

/** OM — Ordem de Manutenção (preventiva, corretiva, instalação, visita, PMOC). */
export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Número sequencial exibido como OM-000123 */
    number: integer("number").generatedAlwaysAsIdentity().notNull(),
    type: workOrderTypeEnum("type").default("preventiva").notNull(),
    origin: workOrderOriginEnum("origin").default("manual").notNull(),
    status: workOrderStatusEnum("status").default("aberta").notNull(),
    priority: priorityEnum("priority").default("normal").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => customerSites.id, { onDelete: "set null" }),
    equipmentId: uuid("equipment_id").references(() => equipment.id, { onDelete: "set null" }),
    contractEquipmentId: uuid("contract_equipment_id").references(() => contractEquipment.id, {
      onDelete: "set null",
    }),
    maintenancePlanId: uuid("maintenance_plan_id").references(() => maintenancePlans.id, {
      onDelete: "set null",
    }),
    technicianId: uuid("technician_id").references(() => technicians.id, { onDelete: "set null" }),
    /** Data prevista pelo plano (preventivas) */
    dueDate: date("due_date"),
    /** Data agendada para o atendimento */
    scheduledDate: date("scheduled_date"),
    scheduledTime: time("scheduled_time"),
    title: text("title").notNull(),
    /** Problema relatado / descrição do serviço */
    description: text("description"),
    diagnosis: text("diagnosis"),
    solution: text("solution"),
    technicianNotes: text("technician_notes"),
    travelStartedAt: timestamp("travel_started_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    checkInLat: doublePrecision("check_in_lat"),
    checkInLng: doublePrecision("check_in_lng"),
    checkOutLat: doublePrecision("check_out_lat"),
    checkOutLng: doublePrecision("check_out_lng"),
    signatureUrl: text("signature_url"),
    signedByName: text("signed_by_name"),
    /** Mão de obra (avulsas) ou valor de referência da visita (contrato) */
    laborAmount: money("labor_amount").default(0).notNull(),
    /** Total cobrado do cliente (mão de obra + materiais cobrados) quando faturável */
    totalAmount: money("total_amount").default(0).notNull(),
    /** Gera conta a receber ao concluir (serviços fora do contrato) */
    billable: boolean("billable").default(false).notNull(),
    receivableId: uuid("receivable_id"),
    rating: integer("rating"),
    ratingComment: text("rating_comment"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("work_orders_number_uq").on(t.number),
    index("work_orders_status_idx").on(t.status),
    index("work_orders_tech_date_idx").on(t.technicianId, t.scheduledDate),
    index("work_orders_customer_idx").on(t.customerId),
    index("work_orders_equipment_idx").on(t.equipmentId),
    /** Idempotência do gerador automático: uma OM por equipamento-de-contrato por vencimento */
    uniqueIndex("work_orders_auto_uq")
      .on(t.contractEquipmentId, t.dueDate)
      .where(sql`${t.origin} = 'automatica'`),
  ],
);

/** Checklist da OM (copiado das tarefas do plano no momento da geração). */
export const workOrderTasks = pgTable(
  "work_order_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    planTaskId: uuid("plan_task_id").references(() => maintenancePlanTasks.id, {
      onDelete: "set null",
    }),
    position: integer("position").default(0).notNull(),
    title: text("title").notNull(),
    instructions: text("instructions"),
    measurementUnit: text("measurement_unit"),
    measurementValue: text("measurement_value"),
    requiresPhoto: boolean("requires_photo").default(false).notNull(),
    done: boolean("done").default(false).notNull(),
    notes: text("notes"),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [index("work_order_tasks_wo_idx").on(t.workOrderId)],
);

export const workOrderPhotos = pgTable(
  "work_order_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => workOrderTasks.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    kind: photoKindEnum("kind").default("outro").notNull(),
    caption: text("caption"),
    takenById: text("taken_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt,
  },
  (t) => [index("work_order_photos_wo_idx").on(t.workOrderId)],
);

/** Materiais aplicados na OM (baixa no estoque do veículo/almoxarifado). */
export const workOrderMaterials = pgTable(
  "work_order_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    locationId: uuid("location_id").references(() => stockLocations.id, { onDelete: "set null" }),
    quantity: qty("quantity").notNull(),
    unitCost: money("unit_cost").default(0).notNull(),
    unitPrice: money("unit_price").default(0).notNull(),
    chargeCustomer: boolean("charge_customer").default(false).notNull(),
    createdAt,
  },
  (t) => [index("work_order_materials_wo_idx").on(t.workOrderId)],
);

/** Linha do tempo / auditoria da OM. */
export const workOrderEvents = pgTable(
  "work_order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    /** created | status | assigned | note | rescheduled | material | photo | signature */
    kind: text("kind").notNull(),
    fromStatus: workOrderStatusEnum("from_status"),
    toStatus: workOrderStatusEnum("to_status"),
    message: text("message"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    createdAt,
  },
  (t) => [index("work_order_events_wo_idx").on(t.workOrderId)],
);
