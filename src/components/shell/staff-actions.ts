"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/session";
import { runDaily } from "@/server/daily";

export async function runDailyNow() {
  try {
    const user = await assertRole(["admin", "gestor"]);
    const summary = await runDaily(`manual:${user.email}`);
    revalidatePath("/admin", "layout");
    return { ok: true as const, summary };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Não foi possível executar a rotina." };
  }
}
