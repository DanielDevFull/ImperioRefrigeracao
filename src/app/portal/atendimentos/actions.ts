"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { workOrders } from "@/db/schema";
import { runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { formatOM } from "@/lib/format";
import { notifyStaff } from "@/server/notify";
import { isUuid } from "../_lib/copy";
import { customerForUser, PORTAL_ROLES } from "../_lib/data";

const ratingSchema = z.object({
  rating: z.coerce
    .number({ error: "Escolha uma nota de 1 a 5." })
    .int("Escolha uma nota de 1 a 5.")
    .min(1, "Escolha uma nota de 1 a 5.")
    .max(5, "Escolha uma nota de 1 a 5."),
  comment: z.string().trim().max(1000, "O comentário pode ter até 1.000 caracteres.").optional(),
});

/** Avaliação do cliente para uma OM concluída — só uma vez e só do próprio cliente. */
export async function rateWorkOrderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole(PORTAL_ROLES);
    const customer = await customerForUser(user.id);

    const id = fd.get("id");
    if (!isUuid(id)) return { ok: false, error: "Atendimento não encontrado." };
    const parsed = ratingSchema.safeParse({
      rating: fd.get("rating") || undefined,
      comment: (fd.get("comment") as string | null) ?? undefined,
    });
    if (!parsed.success) {
      const fieldErrors = zodFieldErrors(parsed.error);
      return { ok: false, error: Object.values(fieldErrors)[0], fieldErrors };
    }

    const [rated] = await db
      .update(workOrders)
      .set({ rating: parsed.data.rating, ratingComment: parsed.data.comment || null })
      .where(
        and(
          eq(workOrders.id, id),
          eq(workOrders.customerId, customer.id),
          eq(workOrders.status, "concluida"),
          isNull(workOrders.rating),
        ),
      )
      .returning({ id: workOrders.id, number: workOrders.number });
    if (!rated) return { ok: false, error: "Este atendimento já foi avaliado ou ainda não foi concluído." };

    if (parsed.data.rating <= 3) {
      await notifyStaff(db, {
        title: `Avaliação ${parsed.data.rating}/5 em ${formatOM(rated.number)}`,
        body: `${customer.name}${parsed.data.comment ? `: "${parsed.data.comment.slice(0, 140)}"` : ""}`,
        link: `/admin/oms/${rated.id}`,
      });
    }

    revalidatePath("/portal", "layout");
    return { ok: true, message: "Avaliação enviada. Obrigado!" };
  });
}
