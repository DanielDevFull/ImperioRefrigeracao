import { boolean, date, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, money, timestamps } from "./_helpers";
import { user } from "./auth";
import { customers } from "./customers";
import {
  financeCategoryTypeEnum,
  payableStatusEnum,
  paymentMethodEnum,
  receivableKindEnum,
  receivableStatusEnum,
} from "./enums";
import { suppliers } from "./inventory";
import { contracts } from "./maintenance";

export const financeCategories = pgTable("finance_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: financeCategoryTypeEnum("type").notNull(),
  color: text("color").default("#3aa8ff").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt,
});

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  initialBalance: money("initial_balance").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt,
});

/** Contas a receber — inclui as mensalidades dos contratos e serviços avulsos. */
export const receivables = pgTable(
  "receivables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    workOrderId: uuid("work_order_id"),
    categoryId: uuid("category_id").references(() => financeCategories.id, {
      onDelete: "set null",
    }),
    kind: receivableKindEnum("kind").default("outro").notNull(),
    description: text("description").notNull(),
    /** Competência YYYY-MM (mensalidades) */
    competence: text("competence"),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    discount: money("discount").default(0).notNull(),
    fine: money("fine").default(0).notNull(),
    interest: money("interest").default(0).notNull(),
    paidAmount: money("paid_amount"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    status: receivableStatusEnum("status").default("aberto").notNull(),
    paymentMethod: paymentMethodEnum("payment_method"),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    /** Identificador usado no Pix (txid) */
    pixTxid: text("pix_txid"),
    /** Comprovante enviado pelo cliente no portal */
    proofUrl: text("proof_url"),
    proofSentAt: timestamp("proof_sent_at", { withTimezone: true }),
    /** Integração futura com gateway (Asaas, Mercado Pago...) */
    gatewayProvider: text("gateway_provider"),
    gatewayId: text("gateway_id"),
    notes: text("notes"),
    confirmedById: text("confirmed_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("receivables_due_idx").on(t.dueDate),
    index("receivables_customer_idx").on(t.customerId),
    index("receivables_status_idx").on(t.status),
    /** Uma mensalidade por contrato por competência */
    uniqueIndex("receivables_contract_competence_uq")
      .on(t.contractId, t.competence)
      .where(sql`${t.kind} = 'mensalidade'`),
  ],
);

export const payables = pgTable(
  "payables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => financeCategories.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    documentNumber: text("document_number"),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    paidAmount: money("paid_amount"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    status: payableStatusEnum("status").default("aberto").notNull(),
    paymentMethod: paymentMethodEnum("payment_method"),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    purchaseOrderId: uuid("purchase_order_id"),
    commissionPayoutId: uuid("commission_payout_id"),
    attachmentUrl: text("attachment_url"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("payables_due_idx").on(t.dueDate), index("payables_status_idx").on(t.status)],
);
