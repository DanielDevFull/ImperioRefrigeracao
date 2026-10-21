import type { PlanInitial } from "../_components/types";
import type { getPlanForEdit } from "./queries";

type Plan = NonNullable<Awaited<ReturnType<typeof getPlanForEdit>>>;

export const emptyPlan: PlanInitial = {
  name: "",
  description: "",
  equipmentTypeId: "",
  isPmoc: false,
  estimatedMinutes: 60,
  visitReferenceValue: 0,
  tasks: [],
  materials: [],
};

/** Converte o plano do banco no rascunho do formulário. `copy` remove os ids (duplicar plano). */
export function planToInitial(plan: Plan, { copy = false } = {}): PlanInitial {
  return {
    name: copy ? `${plan.name} (cópia)` : plan.name,
    description: plan.description ?? "",
    equipmentTypeId: plan.equipmentTypeId ?? "",
    isPmoc: plan.isPmoc,
    estimatedMinutes: plan.estimatedMinutes,
    visitReferenceValue: plan.visitReferenceValue,
    tasks: plan.tasks.map((t) => ({
      key: t.id,
      id: copy ? null : t.id,
      title: t.title,
      instructions: t.instructions ?? "",
      frequencyMonths: t.frequencyMonths,
      measurementUnit: t.measurementUnit ?? "",
      requiresPhoto: t.requiresPhoto,
    })),
    materials: plan.materials.map((m) => ({
      key: m.id,
      productId: m.productId,
      quantity: String(m.quantity).replace(".", ","),
    })),
  };
}
