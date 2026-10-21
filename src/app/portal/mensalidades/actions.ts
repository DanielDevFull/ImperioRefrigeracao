"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { receivables } from "@/db/schema";
import { runAction, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { MAX_UPLOAD_BYTES, storeFile } from "@/lib/storage";
import { submitProof } from "@/server/billing";
import { isUuid } from "../_lib/copy";
import { customerForUser, PORTAL_ROLES } from "../_lib/data";

const ACCEPTED = /^(image\/(png|jpe?g|webp|heic|heif)|application\/pdf)$/;

/** Cliente envia o comprovante do Pix: a conta fica "em análise" até a Imperium confirmar. */
export async function submitProofAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole(PORTAL_ROLES);
    const customer = await customerForUser(user.id);

    const id = fd.get("receivableId");
    const file = fd.get("comprovante");
    if (!isUuid(id)) return { ok: false, error: "Cobrança não encontrada. Atualize a página e tente de novo." };
    if (!(file instanceof File) || file.size === 0) {
      const msg = "Escolha o arquivo do comprovante.";
      return { ok: false, error: msg, fieldErrors: { comprovante: msg } };
    }
    if (!ACCEPTED.test(file.type)) {
      const msg = "Envie uma imagem (JPG ou PNG) ou um PDF do comprovante.";
      return { ok: false, error: msg, fieldErrors: { comprovante: msg } };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      const msg = "O arquivo passa de 8 MB. Envie um print da tela ou um PDF menor.";
      return { ok: false, error: msg, fieldErrors: { comprovante: msg } };
    }

    // Confere que a cobrança é deste cliente antes de gravar o arquivo
    const rec = await db.query.receivables.findFirst({
      where: and(eq(receivables.id, id), eq(receivables.customerId, customer.id)),
      columns: { id: true, status: true },
    });
    if (!rec) return { ok: false, error: "Cobrança não encontrada." };
    if (rec.status === "em_analise") return { ok: false, error: "Já recebemos um comprovante desta cobrança. Ele está em análise." };
    if (rec.status !== "aberto") return { ok: false, error: "Esta cobrança não está mais em aberto." };

    const url = await storeFile("comprovantes", file, file.name);
    await db.transaction((tx) => submitProof(tx, rec.id, customer.id, url));

    revalidatePath("/portal");
    revalidatePath("/portal/mensalidades");
    return { ok: true, message: "Comprovante enviado" };
  });
}
