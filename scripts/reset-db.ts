/** Apaga todo o esquema public (apenas desenvolvimento). */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import postgres from "postgres";

const url = process.env.DATABASE_URL!;
if (!/localhost|127\.0\.0\.1/.test(url) && process.env.FORCE_RESET !== "1") {
  console.error("Recusado: DATABASE_URL não é local. Defina FORCE_RESET=1 para forçar.");
  process.exit(1);
}
async function main() {
  const sql = postgres(url);
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;");
  await sql.end();
  console.log("✓ esquema recriado");
}
main();
