import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_helpers";
import { user } from "./auth";
import { customerStatusEnum, equipmentStatusEnum, personTypeEnum } from "./enums";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Código curto exibido na interface (ex.: CLI-0042) */
    code: integer("code").generatedAlwaysAsIdentity().notNull(),
    personType: personTypeEnum("person_type").default("pf").notNull(),
    name: text("name").notNull(),
    tradeName: text("trade_name"),
    /** CPF ou CNPJ, apenas dígitos */
    document: text("document"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    status: customerStatusEnum("status").default("ativo").notNull(),
    notes: text("notes"),
    /** Acesso ao portal do cliente */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Técnico preferencial padrão para as OMs deste cliente */
    defaultTechnicianId: uuid("default_technician_id"),
    ...timestamps,
  },
  (t) => [
    index("customers_name_idx").on(t.name),
    uniqueIndex("customers_user_id_uq").on(t.userId),
    index("customers_document_idx").on(t.document),
  ],
);

/** Locais de atendimento (endereços) do cliente */
export const customerSites = pgTable(
  "customer_sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    zip: text("zip"),
    street: text("street"),
    number: text("number"),
    complement: text("complement"),
    district: text("district"),
    city: text("city"),
    state: text("state"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    accessNotes: text("access_notes"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    /** Área climatizada e ocupantes — usados no PMOC */
    areaM2: doublePrecision("area_m2"),
    occupants: integer("occupants"),
    ...timestamps,
  },
  (t) => [index("customer_sites_customer_idx").on(t.customerId)],
);

export const equipmentTypes = pgTable("equipment_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  /** climatizacao | refrigeracao_comercial | refrigeracao_industrial */
  category: text("category").default("climatizacao").notNull(),
  /** nome do ícone lucide */
  icon: text("icon").default("air-vent").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: integer("code").generatedAlwaysAsIdentity().notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => customerSites.id, { onDelete: "set null" }),
    typeId: uuid("type_id").references(() => equipmentTypes.id, { onDelete: "set null" }),
    brand: text("brand"),
    model: text("model"),
    serialNumber: text("serial_number"),
    capacityBtu: integer("capacity_btu"),
    /** R-410A, R-32, R-22, R-134a, R-404A, R-290 ... */
    refrigerant: text("refrigerant"),
    voltage: text("voltage"),
    /** Ambiente onde está instalado (ex.: "Sala de reunião") */
    location: text("location"),
    installDate: date("install_date"),
    warrantyUntil: date("warranty_until"),
    status: equipmentStatusEnum("status").default("ativo").notNull(),
    /** Token público usado na etiqueta QR (/e/[token]) */
    qrToken: text("qr_token").notNull(),
    photoUrl: text("photo_url"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("equipment_customer_idx").on(t.customerId),
    index("equipment_site_idx").on(t.siteId),
    uniqueIndex("equipment_qr_token_uq").on(t.qrToken),
  ],
);
