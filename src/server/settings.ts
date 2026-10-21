import "server-only";
import { eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { settings } from "@/db/schema";

export type Settings = typeof settings.$inferSelect;

/** Configurações da empresa; cria a linha padrão na primeira leitura. */
export async function getSettings(tx: Tx | typeof db = db): Promise<Settings> {
  const row = await tx.query.settings.findFirst({ where: eq(settings.id, 1) });
  if (row) return row;
  const [created] = await tx.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await tx.query.settings.findFirst({ where: eq(settings.id, 1) }))!;
}
