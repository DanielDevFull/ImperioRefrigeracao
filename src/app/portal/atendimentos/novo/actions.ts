"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { customerSites, equipment, workOrderPhotos } from "@/db/schema";
import { runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { formatOM } from "@/lib/format";
import { MAX_UPLOAD_BYTES, storeFile } from "@/lib/storage";
import { notifyStaff } from "@/server/notify";
import { createWorkOrder } from "@/server/work-orders";
import { isUuid, MAX_REQUEST_PHOTOS, PROBLEM_CHIPS } from "../../_lib/copy";
import { customerForUser, PORTAL_ROLES } from "../../_lib/data";

const schema = z
  .object({
    equipmentId: z.string().optional(),
    siteId: z.string().optional(),
    sintomas: z.array(z.enum(PROBLEM_CHIPS)).max(PROBLEM_CHIPS.length),
    descricao: z.string().trim().max(2000, "A descrição pode ter até 2.000 caracteres.").optional(),
    prioridade: z.enum(["normal", "alta", "urgente"], { error: "Escolha a urgência." }),
    periodo: z.string().trim().max(200, "Use até 200 caracteres.").optional(),
  })
  .refine((d) => d.sintomas.length > 0 || (d.descricao?.length ?? 0) >= 5, {
    message: "Escolha o que está acontecendo ou descreva o problema em poucas palavras.",
    path: ["descricao"],
  });

/** Chamado aberto pelo cliente: vira uma OM (corretiva ou instalação) e avisa a equipe. */
export async function createServiceRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertRole(PORTAL_ROLES);
    const customer = await customerForUser(user.id);

    const str = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
    };
    const parsed = schema.safeParse({
      equipmentId: str("equipmentId"),
      siteId: str("siteId"),
      sintomas: fd.getAll("sintomas").map(String),
      descricao: str("descricao"),
      prioridade: str("prioridade") ?? "normal",
      periodo: str("periodo"),
    });
    if (!parsed.success) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    const input = parsed.data;

    // Equipamento e local precisam ser deste cliente
    let eqRow: { id: string; siteId: string | null; brand: string | null; model: string | null; location: string | null; typeName: string | null } | null = null;
    if (input.equipmentId && input.equipmentId !== "outro") {
      if (!isUuid(input.equipmentId)) return { ok: false, error: "Equipamento não encontrado.", fieldErrors: { equipmentId: "Equipamento não encontrado." } };
      const found = await db.query.equipment.findFirst({
        where: and(eq(equipment.id, input.equipmentId), eq(equipment.customerId, customer.id), ne(equipment.status, "removido")),
        with: { type: { columns: { name: true } } },
      });
      if (!found) return { ok: false, error: "Equipamento não encontrado.", fieldErrors: { equipmentId: "Equipamento não encontrado." } };
      eqRow = { id: found.id, siteId: found.siteId, brand: found.brand, model: found.model, location: found.location, typeName: found.type?.name ?? null };
    }

    const sites = await db.query.customerSites.findMany({
      where: eq(customerSites.customerId, customer.id),
      columns: { id: true, isPrimary: true },
    });
    let siteId: string | null = eqRow?.siteId ?? null;
    if (!siteId && input.siteId) {
      if (!sites.some((s) => s.id === input.siteId)) {
        return { ok: false, error: "Local não encontrado.", fieldErrors: { siteId: "Escolha um dos seus endereços." } };
      }
      siteId = input.siteId;
    }
    if (!siteId) siteId = (sites.find((s) => s.isPrimary) ?? sites[0])?.id ?? null;

    // Fotos opcionais (imagens, até 3)
    const photos = fd.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
    if (photos.length > MAX_REQUEST_PHOTOS) {
      return { ok: false, error: `Envie até ${MAX_REQUEST_PHOTOS} fotos.`, fieldErrors: { fotos: `Envie até ${MAX_REQUEST_PHOTOS} fotos.` } };
    }
    for (const p of photos) {
      if (!p.type.startsWith("image/")) return { ok: false, error: "As fotos precisam ser imagens (JPG ou PNG).", fieldErrors: { fotos: "As fotos precisam ser imagens (JPG ou PNG)." } };
      if (p.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Cada foto pode ter até 8 MB.", fieldErrors: { fotos: "Cada foto pode ter até 8 MB." } };
    }
    const urls = await Promise.all(photos.map((p) => storeFile("om", p, p.name)));

    const symptoms = input.sintomas;
    const isInstall = symptoms.includes("Instalação/remoção");
    const eqName = eqRow ? [eqRow.brand, eqRow.model].filter(Boolean).join(" ") || eqRow.typeName || "Equipamento" : null;
    const headline = symptoms.filter((s) => s !== "Outro").join(", ") || (isInstall ? "Instalação/remoção" : "Solicitação de atendimento");
    const title = eqName ? `${headline} — ${eqName}${eqRow?.location ? ` (${eqRow.location})` : ""}` : headline;
    const description = [
      symptoms.length ? `Sintomas marcados: ${symptoms.join(", ")}.` : null,
      input.descricao ?? null,
      !eqRow ? "Equipamento: o cliente não identificou (escolheu \"Outro / não sei\")." : null,
      input.periodo ? `Período preferido para a visita: ${input.periodo}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const wo = await db.transaction(async (tx) => {
      const created = await createWorkOrder(
        tx,
        {
          type: isInstall ? "instalacao" : "corretiva",
          origin: "portal_cliente",
          priority: input.prioridade,
          customerId: customer.id,
          siteId,
          equipmentId: eqRow?.id ?? null,
          title,
          description,
          billable: true,
        },
        { userId: user.id },
      );
      if (!created) throw new Error("Não foi possível abrir o chamado. Tente novamente.");
      if (urls.length) {
        await tx.insert(workOrderPhotos).values(
          urls.map((url) => ({ workOrderId: created.id, url, kind: "problema" as const, caption: "Foto enviada pelo cliente", takenById: user.id })),
        );
      }
      await notifyStaff(tx, {
        title: "Novo chamado pelo portal",
        body: `${formatOM(created.number)} — ${customer.name}: ${title}${input.prioridade !== "normal" ? ` (prioridade ${input.prioridade})` : ""}`,
        link: `/admin/oms/${created.id}`,
      });
      return created;
    });

    revalidatePath("/portal", "layout");
    redirect(`/portal/atendimentos/novo?criado=${wo.id}`);
  });
}
