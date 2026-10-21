"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/db";
import { contractEquipment, customerSites, customers, equipment, equipmentTypes, workOrders } from "@/db/schema";
import { assertRole } from "@/lib/auth/session";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { formatContractCode } from "@/lib/format";
import { refrigerants } from "@/lib/labels";
import { MAX_UPLOAD_BYTES, storeFile } from "@/lib/storage";
import { isUuid, sitesOf } from "./_lib/queries";

const staff = () => assertRole(["admin", "gestor"]);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .nullable();

const schema = z
  .object({
    customerId: z.uuid("Escolha o cliente."),
    siteId: z.uuid("Local inválido.").nullable(),
    typeId: z.uuid("Escolha o tipo de equipamento.").nullable(),
    brand: z.string().max(80, "Marca: no máximo 80 caracteres.").nullable(),
    model: z.string().max(120, "Modelo: no máximo 120 caracteres.").nullable(),
    serialNumber: z.string().max(120, "Número de série: no máximo 120 caracteres.").nullable(),
    capacityBtu: z
      .number()
      .int("Capacidade em BTU/h, sem casas decimais.")
      .min(1000, "Capacidade muito baixa: informe em BTU/h (ex.: 12.000).")
      .max(5_000_000, "Capacidade muito alta: confira o valor em BTU/h.")
      .nullable(),
    refrigerant: z.string().max(20, "Fluido: no máximo 20 caracteres.").nullable(),
    voltage: z.string().max(40).nullable(),
    location: z.string().max(120, "Ambiente: no máximo 120 caracteres.").nullable(),
    installDate: isoDate,
    warrantyUntil: isoDate,
    status: z.enum(["ativo", "inativo", "em_manutencao", "removido"]),
    notes: z.string().max(4000).nullable(),
  })
  .refine((v) => !v.installDate || !v.warrantyUntil || v.warrantyUntil >= v.installDate, {
    path: ["warrantyUntil"],
    message: "A garantia termina antes da instalação. Confira as datas.",
  });

const squash = (s: string) => s.replace(/[\s-]/g, "").toLowerCase();
/** "r410a" → "R-410A"; valores fora da lista ficam como digitados. */
function canonicalRefrigerant(value: string | null) {
  if (!value) return null;
  return refrigerants.find((r) => squash(r) === squash(value)) ?? value;
}

function read(fd: FormData) {
  const v = formValues(fd);
  const btu = v.str("capacityBtu");
  return {
    customerId: v.str("customerId") ?? "",
    siteId: v.str("siteId"),
    typeId: v.str("typeId"),
    brand: v.str("brand"),
    model: v.str("model"),
    serialNumber: v.str("serialNumber"),
    capacityBtu: btu == null ? null : Number(btu.replace(/\D/g, "")) || null,
    refrigerant: canonicalRefrigerant(v.str("refrigerant")),
    voltage: v.str("voltage"),
    location: v.str("location"),
    installDate: v.str("installDate"),
    warrantyUntil: v.str("warrantyUntil"),
    status: (v.str("status") ?? "ativo") as "ativo",
    notes: v.str("notes"),
  };
}

function revalidateEquipment(id: string, customerId?: string | null) {
  revalidatePath("/admin/equipamentos");
  revalidatePath(`/admin/equipamentos/${id}`);
  if (customerId) revalidatePath(`/admin/clientes/${customerId}`);
}

export async function saveEquipment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const id = formValues(fd).str("id");
    const raw = read(fd);
    const parsed = schema.safeParse(raw);
    const fieldErrors: Record<string, string> = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors };
    const data = parsed.data;

    const existing = id ? await db.query.equipment.findFirst({ where: eq(equipment.id, id) }) : undefined;
    if (id && !existing) return { ok: false, error: "Equipamento não encontrado. Ele pode ter sido excluído." };

    const customer = await db.query.customers.findFirst({ where: eq(customers.id, data.customerId), columns: { id: true } });
    if (!customer) fieldErrors.customerId = "Cliente não encontrado.";
    if (data.siteId) {
      const site = await db.query.customerSites.findFirst({
        where: and(eq(customerSites.id, data.siteId), eq(customerSites.customerId, data.customerId)),
        columns: { id: true },
      });
      if (!site) fieldErrors.siteId = "Este local não pertence ao cliente escolhido.";
    }
    if (data.typeId) {
      const type = await db.query.equipmentTypes.findFirst({ where: eq(equipmentTypes.id, data.typeId), columns: { id: true } });
      if (!type) fieldErrors.typeId = "Tipo de equipamento não encontrado.";
    }
    if (data.status === "removido" && existing?.status !== "removido")
      fieldErrors.status = "Para retirar o aparelho, use “Marcar como removido” na ficha do equipamento.";
    if (existing && existing.customerId !== data.customerId) {
      const [[wo], [ce]] = await Promise.all([
        db.select({ n: count() }).from(workOrders).where(eq(workOrders.equipmentId, existing.id)),
        db.select({ n: count() }).from(contractEquipment).where(eq(contractEquipment.equipmentId, existing.id)),
      ]);
      if (wo.n + ce.n > 0)
        fieldErrors.customerId =
          "Este equipamento já tem histórico com o cliente atual. Marque-o como removido e cadastre um novo para o outro cliente.";
    }

    // Foto (opcional)
    const photo = fd.get("photo");
    let photoUrl: string | null | undefined = undefined;
    if (photo instanceof File && photo.size > 0) {
      if (!photo.type.startsWith("image/")) fieldErrors.photo = "Envie uma imagem (JPG, PNG, WEBP ou HEIC).";
      else if (photo.size > MAX_UPLOAD_BYTES)
        fieldErrors.photo = `Foto muito grande: o limite é ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`;
    } else if (formValues(fd).bool("removePhoto")) {
      photoUrl = null;
    }

    if (Object.keys(fieldErrors).length) return { ok: false, error: "Revise os campos destacados.", fieldErrors };
    if (photo instanceof File && photo.size > 0) photoUrl = await storeFile("equipamentos", photo, photo.name);

    if (existing) {
      await db
        .update(equipment)
        .set({ ...data, ...(photoUrl !== undefined ? { photoUrl } : {}) })
        .where(eq(equipment.id, existing.id));
      revalidateEquipment(existing.id, data.customerId);
      return { ok: true, message: "Equipamento salvo", id: existing.id };
    }

    const [created] = await db
      .insert(equipment)
      .values({ ...data, status: "ativo", qrToken: nanoid(12), photoUrl: photoUrl ?? null })
      .returning({ id: equipment.id });
    revalidateEquipment(created.id, data.customerId);
    return { ok: true, message: "Equipamento cadastrado", id: created.id };
  });
}

/** Locais do cliente escolhido no formulário. */
export async function sitesForCustomer(customerId: string) {
  await staff();
  return isUuid(customerId) ? sitesOf(customerId) : [];
}

export async function regenerateQrToken(id: string): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const [row] = await db
      .update(equipment)
      .set({ qrToken: nanoid(12) })
      .where(eq(equipment.id, id))
      .returning({ id: equipment.id, customerId: equipment.customerId });
    if (!row) return { ok: false, error: "Equipamento não encontrado." };
    revalidateEquipment(row.id, row.customerId);
    return { ok: true, message: "Novo QR gerado. Imprima e cole a etiqueta nova; a antiga deixou de funcionar." };
  });
}

/** Retira o aparelho de operação sem apagar o histórico e encerra a cobertura do contrato. */
export async function markEquipmentRemoved(id: string): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const item = await db.query.equipment.findFirst({ where: eq(equipment.id, id), columns: { id: true, customerId: true } });
    if (!item) return { ok: false, error: "Equipamento não encontrado." };
    const ended = await db.transaction(async (tx) => {
      await tx.update(equipment).set({ status: "removido" }).where(eq(equipment.id, id));
      return tx
        .update(contractEquipment)
        .set({ active: false, removedAt: new Date() })
        .where(and(eq(contractEquipment.equipmentId, id), eq(contractEquipment.active, true)))
        .returning({ contractId: contractEquipment.contractId });
    });
    revalidateEquipment(id, item.customerId);
    for (const e of ended) revalidatePath(`/admin/contratos/${e.contractId}`);
    return {
      ok: true,
      message: ended.length ? "Equipamento removido e retirado do contrato" : "Equipamento marcado como removido",
    };
  });
}

export async function reactivateEquipment(id: string): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const [row] = await db
      .update(equipment)
      .set({ status: "ativo" })
      .where(eq(equipment.id, id))
      .returning({ id: equipment.id, customerId: equipment.customerId });
    if (!row) return { ok: false, error: "Equipamento não encontrado." };
    revalidateEquipment(row.id, row.customerId);
    return { ok: true, message: "Equipamento reativado" };
  });
}

/** Exclusão definitiva só para cadastro sem nenhum histórico (criado por engano). */
export async function deleteEquipment(id: string): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const item = await db.query.equipment.findFirst({ where: eq(equipment.id, id), columns: { id: true, customerId: true } });
    if (!item) return { ok: false, error: "Equipamento não encontrado." };
    const [[wo], links] = await Promise.all([
      db.select({ n: count() }).from(workOrders).where(eq(workOrders.equipmentId, id)),
      db.query.contractEquipment.findMany({
        where: eq(contractEquipment.equipmentId, id),
        with: { contract: { columns: { code: true } } },
      }),
    ]);
    if (wo.n > 0) return { ok: false, error: "Este equipamento tem OMs registradas. Marque-o como removido em vez de excluir." };
    if (links.length)
      return {
        ok: false,
        error: `Este equipamento está no contrato ${formatContractCode(links[0].contract.code)}. Marque-o como removido em vez de excluir.`,
      };
    await db.delete(equipment).where(eq(equipment.id, id));
    revalidatePath("/admin/equipamentos");
    revalidatePath(`/admin/clientes/${item.customerId}`);
    return { ok: true, message: "Equipamento excluído" };
  });
}
