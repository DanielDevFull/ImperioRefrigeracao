import { round2 } from "./billing";

export type CommissionBasis =
  | "percentual_mao_de_obra"
  | "percentual_total"
  | "percentual_materiais"
  | "fixo_por_om";

export type Rule = {
  id: string;
  technicianId: string | null;
  workOrderType: string | null;
  basis: CommissionBasis;
  rate: number;
  priority: number;
  active: boolean;
};

/** Regra mais específica: técnico + tipo > técnico > tipo > geral; empate → maior prioridade. */
export function pickRule<R extends Rule>(rules: R[], technicianId: string, type: string): R | null {
  const score = (r: Rule) =>
    (r.technicianId ? 2 : 0) + (r.workOrderType ? 1 : 0);
  const candidates = rules.filter(
    (r) =>
      r.active &&
      (r.technicianId === null || r.technicianId === technicianId) &&
      (r.workOrderType === null || r.workOrderType === type),
  );
  candidates.sort((a, b) => score(b) - score(a) || b.priority - a.priority);
  return candidates[0] ?? null;
}

export function computeCommission(
  rule: Pick<Rule, "basis" | "rate">,
  amounts: { labor: number; materialsCharged: number },
) {
  const total = amounts.labor + amounts.materialsCharged;
  const base =
    rule.basis === "percentual_mao_de_obra"
      ? amounts.labor
      : rule.basis === "percentual_total"
        ? total
        : rule.basis === "percentual_materiais"
          ? amounts.materialsCharged
          : 1;
  const amount = rule.basis === "fixo_por_om" ? rule.rate : (base * rule.rate) / 100;
  return { base: round2(rule.basis === "fixo_por_om" ? 0 : base), amount: round2(amount) };
}
