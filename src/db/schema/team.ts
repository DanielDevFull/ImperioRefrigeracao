import { boolean, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, money, timestamps } from "./_helpers";
import { user } from "./auth";
import {
  commissionBasisEnum,
  commissionStatusEnum,
  payoutStatusEnum,
  workOrderTypeEnum,
} from "./enums";

export const technicians = pgTable(
  "technicians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Login do técnico no app */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    document: text("document"),
    /** Cor usada na agenda e nos avatares */
    color: text("color").default("#3aa8ff").notNull(),
    skills: text("skills").array().default([]).notNull(),
    vehiclePlate: text("vehicle_plate"),
    admissionDate: date("admission_date"),
    active: boolean("active").default(true).notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("technicians_user_id_uq").on(t.userId)],
);

/** Folgas, férias e afastamentos: o gerador de OMs não atribui OMs nesses dias. */
export const technicianAbsences = pgTable(
  "technician_absences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    technicianId: uuid("technician_id")
      .notNull()
      .references(() => technicians.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason"),
    createdAt,
  },
  (t) => [index("technician_absences_tech_idx").on(t.technicianId)],
);

/**
 * Regra de comissão. A regra mais específica vence:
 * técnico + tipo de OM > técnico > tipo de OM > geral; empate → maior prioridade.
 */
export const commissionRules = pgTable("commission_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  technicianId: uuid("technician_id").references(() => technicians.id, { onDelete: "cascade" }),
  workOrderType: workOrderTypeEnum("work_order_type"),
  basis: commissionBasisEnum("basis").notNull(),
  /** Percentual (ex.: 10 = 10%) ou valor fixo em R$ quando basis = fixo_por_om */
  rate: money("rate").notNull(),
  priority: integer("priority").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
});

export const commissionPayouts = pgTable("commission_payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  technicianId: uuid("technician_id")
    .notNull()
    .references(() => technicians.id, { onDelete: "restrict" }),
  /** Competência YYYY-MM */
  period: text("period").notNull(),
  totalAmount: money("total_amount").notNull(),
  status: payoutStatusEnum("status").default("aberto").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  /** Conta a pagar gerada para o fechamento */
  payableId: uuid("payable_id"),
  notes: text("notes"),
  ...timestamps,
});

export const commissionEntries = pgTable(
  "commission_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    technicianId: uuid("technician_id")
      .notNull()
      .references(() => technicians.id, { onDelete: "restrict" }),
    workOrderId: uuid("work_order_id").notNull(),
    ruleId: uuid("rule_id").references(() => commissionRules.id, { onDelete: "set null" }),
    basis: commissionBasisEnum("basis").notNull(),
    baseAmount: money("base_amount").notNull(),
    rate: money("rate").notNull(),
    amount: money("amount").notNull(),
    /** Competência YYYY-MM (mês de conclusão da OM) */
    period: text("period").notNull(),
    status: commissionStatusEnum("status").default("pendente").notNull(),
    payoutId: uuid("payout_id").references(() => commissionPayouts.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("commission_entries_wo_tech_uq").on(t.workOrderId, t.technicianId),
    index("commission_entries_period_idx").on(t.period),
  ],
);
