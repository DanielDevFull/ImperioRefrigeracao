import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { isThemePref, THEME_COOKIE } from "@/lib/theme";

/**
 * Guarda o tema no aparelho (cookie) e, com login, na conta.
 * É uma rota (e não Server Action) de propósito: a Server Action que grava cookie faz o Next
 * atualizar a página, e essa atualização interrompia a transição circular da troca de tema.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { tema?: unknown } | null;
  const pref = body?.tema;
  if (!isThemePref(pref)) return Response.json({ ok: false }, { status: 400 });

  const current = await getCurrentUser();
  if (current) await db.update(user).set({ theme: pref }).where(eq(user.id, current.id));

  const res = Response.json({ ok: true });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.headers.append("Set-Cookie", `${THEME_COOKIE}=${pref}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; HttpOnly${secure}`);
  return res;
}
