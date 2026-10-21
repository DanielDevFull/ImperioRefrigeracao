import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  const isPooler = url.includes("-pooler.");
  return postgres(url, {
    // O pooler do Neon (PgBouncer, modo transação) não suporta prepared statements.
    prepare: !isPooler,
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    idle_timeout: 20,
  });
}

const client = globalForDb.pgClient ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
