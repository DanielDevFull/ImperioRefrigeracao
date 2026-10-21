import { numeric, timestamp } from "drizzle-orm/pg-core";

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const createdAt = timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/** Valor monetário em reais (numeric 12,2 lido como number). */
export const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });

/** Quantidade de estoque (aceita frações: kg de gás, metros de tubo). */
export const qty = (name: string) => numeric(name, { precision: 12, scale: 3, mode: "number" });
