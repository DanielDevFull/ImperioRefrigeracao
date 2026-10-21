import { describe, expect, it } from "vitest";
import { computeCommission, pickRule, type Rule } from "../commission";

const base: Omit<Rule, "id"> = { technicianId: null, workOrderType: null, basis: "percentual_mao_de_obra", rate: 10, priority: 0, active: true };
const rules: Rule[] = [
  { ...base, id: "geral" },
  { ...base, id: "corretiva", workOrderType: "corretiva", rate: 15 },
  { ...base, id: "joao", technicianId: "joao", rate: 12 },
  { ...base, id: "joao-corretiva", technicianId: "joao", workOrderType: "corretiva", rate: 20 },
  { ...base, id: "inativa", technicianId: "joao", workOrderType: "preventiva", rate: 99, active: false },
];

describe("pickRule", () => {
  it("escolhe a mais específica", () => {
    expect(pickRule(rules, "joao", "corretiva")?.id).toBe("joao-corretiva");
    expect(pickRule(rules, "joao", "preventiva")?.id).toBe("joao");
    expect(pickRule(rules, "maria", "corretiva")?.id).toBe("corretiva");
    expect(pickRule(rules, "maria", "preventiva")?.id).toBe("geral");
  });
  it("desempata por prioridade", () => {
    const r = [{ ...base, id: "a", priority: 1 }, { ...base, id: "b", priority: 5 }];
    expect(pickRule(r, "x", "preventiva")?.id).toBe("b");
  });
  it("sem regras retorna null", () => {
    expect(pickRule([], "x", "preventiva")).toBeNull();
  });
});

describe("computeCommission", () => {
  it("calcula pelas bases", () => {
    const amounts = { labor: 250, materialsCharged: 150 };
    expect(computeCommission({ basis: "percentual_mao_de_obra", rate: 10 }, amounts)).toEqual({ base: 250, amount: 25 });
    expect(computeCommission({ basis: "percentual_total", rate: 10 }, amounts)).toEqual({ base: 400, amount: 40 });
    expect(computeCommission({ basis: "percentual_materiais", rate: 5 }, amounts)).toEqual({ base: 150, amount: 7.5 });
    expect(computeCommission({ basis: "fixo_por_om", rate: 30 }, amounts)).toEqual({ base: 0, amount: 30 });
  });
});
