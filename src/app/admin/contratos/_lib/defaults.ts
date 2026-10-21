/**
 * Plano sugerido para um equipamento: um plano ativo do mesmo tipo de equipamento
 * (entre vários, o PMOC para pessoa jurídica e o comum para pessoa física); sem plano do tipo,
 * o primeiro plano ativo.
 */
export function defaultPlanFor<P extends { equipmentTypeId: string | null; isPmoc: boolean }>(
  typeId: string | null,
  plans: P[],
  preferPmoc: boolean,
): P | null {
  const matches = typeId ? plans.filter((p) => p.equipmentTypeId === typeId) : [];
  if (!matches.length) return plans[0] ?? null;
  return matches.find((p) => p.isPmoc === preferPmoc) ?? matches[0];
}
