import { boolean, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, money, timestamps } from "./_helpers";
import { user } from "./auth";
import { customerSites, customers } from "./customers";

/** Configurações da empresa (linha única, id = 1). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").default("Imperium Tec Refrigeração").notNull(),
  document: text("document"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  /** Pix para receber mensalidades (baixa manual) */
  pixKey: text("pix_key"),
  pixMerchantName: text("pix_merchant_name"),
  pixMerchantCity: text("pix_merchant_city"),
  /** Multa (%) e juros ao mês (%) sobre mensalidades em atraso */
  lateFinePercent: money("late_fine_percent").default(2).notNull(),
  lateInterestMonthlyPercent: money("late_interest_monthly_percent").default(1).notNull(),
  /** Quantos dias antes do vencimento a mensalidade é gerada */
  invoiceLeadDays: integer("invoice_lead_days").default(15).notNull(),
  /** Horizonte (dias) para gerar OMs preventivas à frente */
  workOrderHorizonDays: integer("work_order_horizon_days").default(30).notNull(),
  /** Bloqueia a geração de OMs para clientes com mensalidade vencida há mais de N dias (0 = não bloqueia) */
  blockOverdueDays: integer("block_overdue_days").default(0).notNull(),
  /** Atende aos sábados (senão, OMs que caem no sábado vão para sexta) */
  worksSaturday: boolean("works_saturday").default(false).notNull(),
  /** Quando a comissão é liberada: "conclusao" da OM ou "recebimento" do valor cobrado */
  commissionTrigger: text("commission_trigger").default("conclusao").notNull(),
  /** Prazo (dias) para pagamento de serviços avulsos concluídos */
  serviceDueDays: integer("service_due_days").default(5).notNull(),
  /** Responsável técnico do PMOC */
  pmocResponsibleName: text("pmoc_responsible_name"),
  pmocResponsibleRegistry: text("pmoc_responsible_registry"),
  pmocResponsibleArt: text("pmoc_responsible_art"),
  lastDailyRunAt: timestamp("last_daily_run_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

/** PMOC — Plano de Manutenção, Operação e Controle de um local do cliente. */
export const pmocDocuments = pgTable(
  "pmoc_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => customerSites.id, { onDelete: "set null" }),
    responsibleName: text("responsible_name").notNull(),
    responsibleRegistry: text("responsible_registry"),
    artNumber: text("art_number"),
    validFrom: date("valid_from").notNull(),
    validUntil: date("valid_until").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("pmoc_documents_customer_idx").on(t.customerId)],
);

/** Registro da rotina diária (geração de OMs e mensalidades). */
export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  job: text("job").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok"),
  summary: text("summary"),
  triggeredBy: text("triggered_by"),
});
