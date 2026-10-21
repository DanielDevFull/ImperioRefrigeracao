import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money, qty, timestamps } from "./_helpers";
import { customers, equipment, equipmentTypes } from "./customers";
import { contractStatusEnum } from "./enums";
import { products } from "./inventory";
import { technicians } from "./team";

/**
 * Plano de manutenção (modelo técnico). Cada tarefa tem a sua frequência em meses;
 * a visita acontece a cada `min(frequência das tarefas)` meses e inclui as tarefas
 * cujo ciclo cai naquele mês.
 */
export const maintenancePlans = pgTable("maintenance_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  equipmentTypeId: uuid("equipment_type_id").references(() => equipmentTypes.id, {
    onDelete: "set null",
  }),
  /** Plano atende os requisitos do PMOC (Lei 13.589/2018) */
  isPmoc: boolean("is_pmoc").default(false).notNull(),
  /** Duração estimada da visita, em minutos */
  estimatedMinutes: integer("estimated_minutes").default(60).notNull(),
  /** Valor de referência da visita (base para comissão das OMs de contrato) */
  visitReferenceValue: money("visit_reference_value").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
});

export const maintenancePlanTasks = pgTable(
  "maintenance_plan_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => maintenancePlans.id, { onDelete: "cascade" }),
    position: integer("position").default(0).notNull(),
    title: text("title").notNull(),
    instructions: text("instructions"),
    /** 1 = mensal, 2 = bimestral, 3 = trimestral, 6 = semestral, 12 = anual */
    frequencyMonths: integer("frequency_months").default(1).notNull(),
    /** Exige registrar uma medição (pressão, corrente, temperatura...) */
    measurementUnit: text("measurement_unit"),
    requiresPhoto: boolean("requires_photo").default(false).notNull(),
  },
  (t) => [index("maintenance_plan_tasks_plan_idx").on(t.planId)],
);

/** Materiais consumidos em cada visita (previsão de compra). */
export const maintenancePlanMaterials = pgTable(
  "maintenance_plan_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => maintenancePlans.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: qty("quantity").notNull(),
  },
  (t) => [uniqueIndex("maintenance_plan_materials_uq").on(t.planId, t.productId)],
);

/** Contrato / plano comercial do cliente: gera as mensalidades. */
export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: integer("code").generatedAlwaysAsIdentity().notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** Nome comercial do plano (ex.: "Plano Glacial — 4 aparelhos") */
    name: text("name").notNull(),
    monthlyAmount: money("monthly_amount").notNull(),
    /** Dia de vencimento da mensalidade (1–28) */
    billingDay: integer("billing_day").default(10).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    status: contractStatusEnum("status").default("ativo").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("contracts_customer_idx").on(t.customerId)],
);

/** Equipamento coberto pelo contrato, com o seu plano de manutenção e âncora de agenda. */
export const contractEquipment = pgTable(
  "contract_equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    maintenancePlanId: uuid("maintenance_plan_id")
      .notNull()
      .references(() => maintenancePlans.id, { onDelete: "restrict" }),
    /** Data da primeira visita; as próximas seguem o intervalo do plano a partir dela */
    anchorDate: date("anchor_date").notNull(),
    preferredTechnicianId: uuid("preferred_technician_id").references(() => technicians.id, {
      onDelete: "set null",
    }),
    active: boolean("active").default(true).notNull(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    /** Última data de vencimento já gerada como OM (controle do gerador) */
    lastGeneratedDueDate: date("last_generated_due_date"),
    ...timestamps,
  },
  (t) => [
    index("contract_equipment_contract_idx").on(t.contractId),
    uniqueIndex("contract_equipment_active_uq")
      .on(t.equipmentId)
      .where(sql`${t.active} = true`),
  ],
);
