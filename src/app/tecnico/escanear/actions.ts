"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { equipment } from "@/db/schema";
import { assertRole } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import { SESSION_LOST, type TechState } from "../_lib/types";

/** Lê o que veio do QR (URL `/e/<token>`, token puro) ou do código digitado (EQ-00012 / 12). */
function parseCode(raw: string): { token?: string; code?: number } {
  const s = raw.trim();
  if (!s) return {};
  try {
    const u = new URL(s);
    const m = /\/e\/([^/?#]+)/.exec(u.pathname);
    if (m) return { token: decodeURIComponent(m[1]) };
  } catch {
    /* não é URL */
  }
  const path = /(?:^|\/)e\/([A-Za-z0-9_-]{4,64})(?:[/?#]|$)/.exec(s);
  if (path) return { token: path[1] };
  const code = /^(?:EQ[\s-]*)?0*(\d{1,7})$/i.exec(s);
  if (code) return { code: Number(code[1]), token: s };
  if (/^[A-Za-z0-9_-]{4,64}$/.test(s)) return { token: s };
  return {};
}

/** Resolve o QR/código para o id do equipamento (somente leitura). */
export async function resolveScanAction(raw: string): Promise<TechState> {
  const user = await assertRole(["tecnico", "admin", "gestor"]).catch(() => null);
  if (!user) return SESSION_LOST;
  return runAction(async () => {
    if (typeof raw !== "string" || raw.length > 500) return { ok: false, error: "Código inválido." };
    const { token, code } = parseCode(raw);
    if (!token && code == null) {
      return { ok: false, error: "Este QR não é de um equipamento Imperium. Aponte para a etiqueta do aparelho." };
    }
    let found: { id: string } | undefined;
    if (code != null && Number.isSafeInteger(code)) {
      found = await db.query.equipment.findFirst({ where: eq(equipment.code, code), columns: { id: true } });
    }
    if (!found && token) {
      found = await db.query.equipment.findFirst({ where: eq(equipment.qrToken, token), columns: { id: true } });
    }
    if (!found) {
      return {
        ok: false,
        error: code != null ? `Nenhum equipamento com o código EQ-${String(code).padStart(5, "0")}.` : "Etiqueta não encontrada. Confira o código impresso abaixo do QR.",
      };
    }
    return { ok: true, id: found.id };
  });
}
