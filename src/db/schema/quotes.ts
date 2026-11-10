import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { money, qty, timestamps } from "./_helpers";
import { user } from "./auth";
import { customers } from "./customers";
import { personTypeEnum, quoteItemKindEnum, quoteStatusEnum, workOrderTypeEnum } from "./enums";
import { products } from "./inventory";
import { workOrders } from "./work-orders";

/**
 * Orçamento avulso, inclusive para quem ainda não é cliente: os dados de contato e o endereço
 * ficam no próprio orçamento e só viram cadastro (cliente + local) quando ele é aprovado.
 */
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Número sequencial exibido como ORC-00012 */
    number: integer("number").generatedAlwaysAsIdentity().notNull(),
    status: quoteStatusEnum("status").default("rascunho").notNull(),
    /** Cliente já cadastrado (opcional); preenchido na aprovação quando o contato vira cliente */
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    contactName: text("contact_name").notNull(),
    contactPersonType: personTypeEnum("contact_person_type").default("pf").notNull(),
    /** CPF ou CNPJ normalizado (sem pontuação) */
    contactDocument: text("contact_document"),
    /** DDD + número, só dígitos */
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    /** Endereço do serviço (vira o local de atendimento do cliente) */
    zip: text("zip"),
    street: text("street"),
    addressNumber: text("address_number"),
    complement: text("complement"),
    district: text("district"),
    city: text("city"),
    state: text("state"),
    /** Tipo da OM gerada na aprovação */
    workType: workOrderTypeEnum("work_type").default("corretiva").notNull(),
    title: text("title").notNull(),
    /** Escopo, problema relatado, equipamento */
    description: text("description"),
    discount: money("discount").default(0).notNull(),
    /** Total já com desconto (guardado para listas e relatórios) */
    total: money("total").default(0).notNull(),
    validUntil: date("valid_until").notNull(),
    /** Condições (pagamento, garantia, prazo) impressas no orçamento */
    terms: text("terms"),
    /** Token do link público (/orcamento/[token]) para o cliente ver e aprovar */
    publicToken: text("public_token").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    /** Aprovação ou recusa */
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** "cliente" (pelo link) ou "equipe" (registrado no sistema) */
    decidedVia: text("decided_via"),
    decidedByName: text("decided_by_name"),
    decidedById: text("decided_by_id").references(() => user.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    workOrderId: uuid("work_order_id").references(() => workOrders.id, { onDelete: "set null" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("quotes_number_uq").on(t.number),
    uniqueIndex("quotes_public_token_uq").on(t.publicToken),
    index("quotes_status_idx").on(t.status),
    index("quotes_customer_idx").on(t.customerId),
    /** uma OM nasce de no máximo um orçamento */
    uniqueIndex("quotes_work_order_uq").on(t.workOrderId),
  ],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    position: integer("position").default(0).notNull(),
    kind: quoteItemKindEnum("kind").notNull(),
    /** Material do estoque (serviços não têm produto) */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull(),
    unit: text("unit").default("un").notNull(),
    unitPrice: money("unit_price").default(0).notNull(),
  },
  (t) => [index("quote_items_quote_idx").on(t.quoteId)],
);
