"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  contractEquipment,
  equipmentTypes,
  maintenancePlanMaterials,
  maintenancePlanTasks,
  maintenancePlans,
  products,
} from "@/db/schema";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { FREQUENCY_OPTIONS } from "./_lib/preview";

const STAFF = ["admin", "gestor"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));

const taskSchema = z.object({
  id: z.guid().nullish(),
  title: z.string().trim().min(2, "Dê um título à tarefa.").max(160, "Título muito longo (máx. 160)."),
  instructions: optionalText(2000),
  frequencyMonths: z
    .number()
    .int()
    .refine((v) => (FREQUENCY_OPTIONS as readonly number[]).includes(v), "Escolha uma frequência da lista."),
  measurementUnit: optionalText(12),
  requiresPhoto: z.boolean(),
});

const materialSchema = z.object({
  productId: z.guid("Escolha o produto."),
  quantity: z.number("Informe a quantidade.").positive("A quantidade deve ser maior que zero.").max(9999, "Quantidade muito alta."),
});

const planSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome do plano (mínimo 3 letras).").max(120, "Nome muito longo."),
  description: optionalText(600),
  equipmentTypeId: z.guid().nullable(),
  isPmoc: z.boolean(),
  estimatedMinutes: z
    .number("Informe a duração estimada.")
    .int("Use minutos inteiros.")
    .min(10, "A visita precisa ter pelo menos 10 minutos.")
    .max(1440, "Máximo de 24 horas (1440 min)."),
  visitReferenceValue: z.number().min(0, "O valor não pode ser negativo.").max(100000, "Valor muito alto."),
  tasks: z.array(taskSchema).min(1, "Adicione pelo menos uma tarefa: sem tarefas o plano não gera OMs."),
  materials: z.array(materialSchema).superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((m, i) => {
      if (seen.has(m.productId)) ctx.addIssue({ code: "custom", path: [i, "productId"], message: "Produto repetido: ajuste a quantidade na linha anterior." });
      seen.add(m.productId);
    });
  }),
});

export type SavedTask = {
  id: string;
  title: string;
  instructions: string | null;
  frequencyMonths: number;
  measurementUnit: string | null;
  requiresPhoto: boolean;
};

export type PlanActionState = ActionState & { tasks?: SavedTask[] };

function parseJSON(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || !raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Cria ou atualiza o plano com tarefas e materiais numa única transação. */
export async function savePlan(planId: string | null, fd: FormData): Promise<PlanActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const v = formValues(fd);
    const parsed = planSchema.safeParse({
      name: v.str("name") ?? "",
      description: v.str("description"),
      equipmentTypeId: v.str("equipmentTypeId"),
      isPmoc: v.bool("isPmoc"),
      estimatedMinutes: v.num("estimatedMinutes") ?? undefined,
      visitReferenceValue: v.money("visitReferenceValue") ?? 0,
      tasks: parseJSON(fd.get("tasks")),
      materials: parseJSON(fd.get("materials")),
    });
    if (!parsed.success) {
      const fieldErrors = zodFieldErrors(parsed.error);
      return { ok: false, error: "Revise os campos destacados.", fieldErrors };
    }
    const data = parsed.data;

    if (data.equipmentTypeId) {
      const t = await db.query.equipmentTypes.findFirst({ where: eq(equipmentTypes.id, data.equipmentTypeId), columns: { id: true } });
      if (!t) return { ok: false, error: "O tipo de equipamento escolhido não existe mais. Escolha outro." };
    }
    if (data.materials.length) {
      const ids = data.materials.map((m) => m.productId);
      const found = await db.select({ id: products.id }).from(products).where(inArray(products.id, ids));
      if (found.length !== new Set(ids).size) return { ok: false, error: "Algum produto da lista de materiais não existe mais. Remova-o e salve de novo." };
    }

    const result = await db.transaction(async (tx) => {
      const base = {
        name: data.name,
        description: data.description,
        equipmentTypeId: data.equipmentTypeId,
        isPmoc: data.isPmoc,
        estimatedMinutes: data.estimatedMinutes,
        visitReferenceValue: data.visitReferenceValue,
      };
      let id = planId;
      if (id) {
        const [updated] = await tx.update(maintenancePlans).set(base).where(eq(maintenancePlans.id, id)).returning({ id: maintenancePlans.id });
        if (!updated) throw new Error("Plano não encontrado. Ele pode ter sido excluído.");
      } else {
        const [created] = await tx.insert(maintenancePlans).values(base).returning({ id: maintenancePlans.id });
        id = created.id;
      }

      // Tarefas por diferença: atualiza as que já existem, insere as novas e apaga as removidas.
      // O histórico das OMs fica intacto (work_order_tasks.plan_task_id vira null ao apagar).
      const existing = await tx
        .select({ id: maintenancePlanTasks.id })
        .from(maintenancePlanTasks)
        .where(eq(maintenancePlanTasks.planId, id));
      const existingIds = new Set(existing.map((t) => t.id));
      const keep = new Set<string>();
      const saved: SavedTask[] = [];
      for (const [position, t] of data.tasks.entries()) {
        const values = {
          planId: id,
          position,
          title: t.title,
          instructions: t.instructions,
          frequencyMonths: t.frequencyMonths,
          measurementUnit: t.measurementUnit,
          requiresPhoto: t.requiresPhoto,
        };
        if (t.id && existingIds.has(t.id) && !keep.has(t.id)) {
          keep.add(t.id);
          await tx.update(maintenancePlanTasks).set(values).where(eq(maintenancePlanTasks.id, t.id));
          saved.push({ id: t.id, ...values });
        } else {
          const [row] = await tx.insert(maintenancePlanTasks).values(values).returning({ id: maintenancePlanTasks.id });
          saved.push({ id: row.id, ...values });
        }
      }
      const toDelete = [...existingIds].filter((tid) => !keep.has(tid));
      if (toDelete.length) await tx.delete(maintenancePlanTasks).where(inArray(maintenancePlanTasks.id, toDelete));

      // Materiais: substitui a lista inteira (não há histórico apontando para estas linhas).
      await tx.delete(maintenancePlanMaterials).where(eq(maintenancePlanMaterials.planId, id));
      if (data.materials.length) {
        await tx.insert(maintenancePlanMaterials).values(data.materials.map((m) => ({ planId: id, productId: m.productId, quantity: m.quantity })));
      }
      return { id, saved, removed: toDelete.length };
    });

    revalidatePath("/admin/planos");
    revalidatePath(`/admin/planos/${result.id}`);
    revalidatePath("/admin/contratos", "layout");
    return {
      ok: true,
      id: result.id,
      tasks: result.saved.map(({ id, title, instructions, frequencyMonths, measurementUnit, requiresPhoto }) => ({
        id,
        title,
        instructions,
        frequencyMonths,
        measurementUnit,
        requiresPhoto,
      })),
      message: planId ? "Plano salvo" : "Plano criado",
    };
  });
}

/** Ativa ou desativa o plano. Desativado, os contratos que o usam param de gerar OMs. */
export async function setPlanActive(planId: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const [row] = await db
      .update(maintenancePlans)
      .set({ active })
      .where(eq(maintenancePlans.id, planId))
      .returning({ id: maintenancePlans.id });
    if (!row) return { ok: false, error: "Plano não encontrado." };
    revalidatePath("/admin/planos");
    revalidatePath(`/admin/planos/${planId}`);
    revalidatePath("/admin/contratos", "layout");
    revalidatePath("/admin");
    return {
      ok: true,
      message: active ? "Plano reativado: os contratos voltam a gerar OMs" : "Plano desativado",
    };
  });
}

/** Exclui um plano que nunca foi usado em contrato. Planos com histórico só podem ser desativados. */
export async function deletePlan(planId: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...STAFF]);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(contractEquipment)
      .where(and(eq(contractEquipment.maintenancePlanId, planId)));
    if (n > 0) return { ok: false, error: "Este plano já foi usado em contratos. Desative-o em vez de excluir." };
    await db.delete(maintenancePlans).where(eq(maintenancePlans.id, planId));
    revalidatePath("/admin/planos");
    return { ok: true, message: "Plano excluído" };
  });
}
