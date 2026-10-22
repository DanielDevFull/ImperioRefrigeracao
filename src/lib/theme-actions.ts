"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { isThemePref, THEME_COOKIE } from "@/lib/theme";

/** Guarda o tema no aparelho (cookie) e, se houver login, na conta. */
export async function saveThemeAction(pref: string): Promise<{ ok: boolean }> {
  if (!isThemePref(pref)) return { ok: false };
  (await cookies()).set(THEME_COOKIE, pref, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  const current = await getCurrentUser();
  if (current) await db.update(user).set({ theme: pref }).where(eq(user.id, current.id));
  return { ok: true };
}
