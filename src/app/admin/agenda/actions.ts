"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { technicians } from "@/db/schema";
import { type ActionState, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { formatDate, formatOM } from "@/lib/format";
import { assignWorkOrder, getWorkOrderOrThrow } from "@/server/work-orders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/**
 * Move uma OM no quadro de despacho: troca técnico, data e (opcionalmente) horário.
 * `scheduledTime` indefinido mantém o horário atual.
 */
export async function moveOmAction(input: {
  id: string;
  technicianId: string | null;
  scheduledDate: string | null;
  scheduledTime?: string | null;
}): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole(["admin", "gestor"]);
    if (!UUID.test(input.id)) return { ok: false, error: "OM não encontrada." };
    if (input.technicianId !== null && !UUID.test(input.technicianId)) return { ok: false, error: "Técnico inválido." };
    if (input.scheduledDate !== null && !DATE.test(input.scheduledDate)) return { ok: false, error: "Data inválida." };
    if (input.scheduledTime != null && !TIME.test(input.scheduledTime)) return { ok: false, error: "Horário inválido (use hh:mm)." };

    let techName: string | null = null;
    if (input.technicianId) {
      const t = await db.query.technicians.findFirst({
        where: and(eq(technicians.id, input.technicianId), eq(technicians.active, true)),
        columns: { name: true },
      });
      if (!t) return { ok: false, error: "Técnico inativo ou não encontrado." };
      techName = t.name;
    }

    const wo = await db.transaction(async (tx) => {
      const current = await getWorkOrderOrThrow(tx, input.id);
      if (["em_deslocamento", "em_execucao", "concluida", "cancelada"].includes(current.status)) {
        throw new Error(`${formatOM(current.number)} já está em campo ou encerrada e não pode ser movida.`);
      }
      await assignWorkOrder(
        tx,
        input.id,
        { technicianId: input.technicianId, scheduledDate: input.scheduledDate, scheduledTime: input.scheduledTime },
        { userId: user.id },
      );
      return current;
    });

    revalidatePath("/admin/agenda");
    revalidatePath("/admin/oms");
    revalidatePath(`/admin/oms/${input.id}`);
    revalidatePath("/admin");

    const label = formatOM(wo.number);
    if (!input.technicianId) return { ok: true, message: `${label} voltou para a fila sem técnico` };
    const when = input.scheduledDate ? ` em ${formatDate(input.scheduledDate)}` : "";
    const at = input.scheduledTime ? ` às ${input.scheduledTime}` : "";
    return { ok: true, message: `${label} agendada para ${techName}${when}${at}` };
  });
}
