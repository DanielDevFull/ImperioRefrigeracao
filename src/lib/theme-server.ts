import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { isThemePref, THEME_COOKIE, type ThemePref } from "@/lib/theme";

/** Preferência de tema: a da conta quando logado (vale em qualquer aparelho), senão a do aparelho. */
export const getThemePreference = cache(async (): Promise<ThemePref> => {
  const current = await getCurrentUser();
  if (current) {
    const row = await db.query.user.findFirst({ where: eq(user.id, current.id), columns: { theme: true } });
    if (isThemePref(row?.theme)) return row.theme;
  }
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  return isThemePref(saved) ? saved : "system";
});
