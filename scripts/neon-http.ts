/**
 * Operações no Neon pelo endpoint HTTP (útil quando a porta 5432 não está acessível).
 *   tsx scripts/neon-http.ts migrate            aplica as migrações de ./drizzle
 *   tsx scripts/neon-http.ts load <arquivo.sql> executa um dump SQL (INSERTs) em lotes transacionais
 *   tsx scripts/neon-http.ts query "<sql>"
 * Lê DATABASE_URL de .env.production.local (ou do ambiente). Em redes com proxy: NODE_USE_ENV_PROXY=1.
 */
import { config } from "dotenv";
config({ path: ".env.production.local" });
config();
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const sql = neon(url);

  if (cmd === "migrate") {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log("✓ migrações aplicadas");
    return;
  }
  if (cmd === "query") {
    console.log(await sql.query(arg));
    return;
  }
  if (cmd === "load") {
    const text = readFileSync(arg, "utf8");
    const statements = splitStatements(text);
    console.log(`${statements.length} comandos`);
    const BATCH = 200;
    for (let i = 0; i < statements.length; i += BATCH) {
      const chunk = statements.slice(i, i + BATCH);
      await sql.transaction(chunk.map((s) => sql.query(s)));
      process.stdout.write(`\r${Math.min(i + BATCH, statements.length)}/${statements.length}`);
    }
    console.log("\n✓ carga concluída");
    return;
  }
  console.log("uso: migrate | load <arquivo.sql> | query <sql>");
}

/** Divide um dump do pg_dump (--inserts) em comandos, respeitando strings com ';'. */
function splitStatements(text: string) {
  const out: string[] = [];
  let cur = "";
  let inStr = false;
  for (const line of text.split("\n")) {
    if (!inStr && (line.startsWith("--") || line.trim() === "")) continue;
    if (!inStr && /^(SET|SELECT pg_catalog\.set_config|\\)/.test(line)) continue;
    cur += line + "\n";
    for (const ch of line) if (ch === "'") inStr = !inStr;
    if (!inStr && line.trimEnd().endsWith(";")) {
      out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
