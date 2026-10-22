"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { equipment } from "@/db/schema";
import { runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { createWorkOrder } from "@/server/work-orders";
import { actorOf, technicianFor } from "../../_lib/guard";
import { SESSION_LOST, type TechState } from "../../_lib/types";

const schema = z.object({
  equipmentId: z.uuid(),
  description: z
    .string()
    .trim()
    .min(5, "Descreva o problema em poucas palavras (pelo menos 5 letras).")
    .max(1000, "Use no máximo 1000 caracteres."),
  priority: z.enum(["normal", "alta", "urgente"]),
});

/** O técnico abre uma OM corretiva para si mesmo, hoje, a partir da ficha do equipamento. */
export async function openCorrectiveAction(input: z.input<typeof schema>): Promise<TechState> {
  const user = await assertRole(["tecnico", "admin", "gestor"]).catch(() => null);
  if (!user) return SESSION_LOST;
  return runAction(async () => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Revise os dados.", fieldErrors: { description: parsed.error.issues[0]?.message ?? "" } };
    }
    const technician = await technicianFor(user);
    const eq_ = await db.query.equipment.findFirst({
      where: eq(equipment.id, parsed.data.equipmentId),
      with: { type: { columns: { name: true } } },
    });
    if (!eq_) return { ok: false, error: "Equipamento não encontrado." };
    if (eq_.status === "removido") return { ok: false, error: "Este equipamento foi removido do cadastro. Fale com o escritório." };
    const what = [eq_.type?.name ?? "Equipamento", eq_.location].filter(Boolean).join(" — ");
    const wo = await db.transaction((tx) =>
      createWorkOrder(
        tx,
        {
          type: "corretiva",
          origin: "manual",
          priority: parsed.data.priority,
          customerId: eq_.customerId,
          siteId: eq_.siteId,
          equipmentId: eq_.id,
          technicianId: technician.id,
          scheduledDate: todayISO(),
          title: `Corretiva: ${what}`,
          description: `Aberta pelo técnico em campo: ${parsed.data.description}`,
          billable: true,
        },
        actorOf(user),
      ),
    );
    if (!wo) return { ok: false, error: "Não foi possível abrir a OM. Tente de novo." };
    revalidatePath("/tecnico", "layout");
    return { ok: true, id: wo.id, message: "OM corretiva aberta" };
  });
}
