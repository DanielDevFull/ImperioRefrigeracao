/**
 * Define senhas fortes para os acessos de um banco (ex.: produção carregada com a demonstração).
 * Gera uma senha aleatória por usuário, grava o hash (mesmo formato do Better Auth) e encerra as sessões.
 * Uso: NODE_USE_ENV_PROXY=1 tsx scripts/prod-passwords.ts > senhas.txt   (lê DATABASE_URL de .env.production.local)
 */
import { config } from "dotenv";
config({ path: ".env.production.local" });
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { hashPassword } from "better-auth/crypto";

function strongPassword() {
  // 14 caracteres legíveis (sem 0/O/1/l) + sufixo numérico
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10)}`;
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const users = (await sql.query(
    `select u.id, u.email, u.role from "user" u join account a on a.user_id = u.id and a.provider_id = 'credential' order by u.role, u.email`,
  )) as { id: string; email: string; role: string }[];
  const lines: string[] = [];
  for (const u of users) {
    const pwd = strongPassword();
    const hash = await hashPassword(pwd);
    await sql.query(`update account set password = $1, updated_at = now() where user_id = $2 and provider_id = 'credential'`, [hash, u.id]);
    await sql.query(`delete from session where user_id = $1`, [u.id]);
    lines.push(`${u.role.padEnd(8)} ${u.email.padEnd(40)} ${pwd}`);
  }
  console.log(lines.join("\n"));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
