import { describe, expect, it } from "vitest";
import { becomesOmMaterial, daysToExpire, discountFits, effectiveQuoteStatus, quoteTotals } from "../quotes";

const svc = (quantity: number, unitPrice: number) => ({ kind: "servico" as const, productId: null, quantity, unitPrice });
const mat = (quantity: number, unitPrice: number, productId: string | null = "p1") => ({
  kind: "material" as const,
  productId,
  quantity,
  unitPrice,
});

describe("quoteTotals", () => {
  it("separa serviços (mão de obra) de materiais do estoque e tira o desconto da mão de obra", () => {
    const t = quoteTotals([svc(1, 450), mat(3, 60), mat(1, 60)], 50);
    expect(t).toEqual({ services: 450, materials: 240, subtotal: 690, discount: 50, total: 640, labor: 400 });
  });

  it("material sem produto do estoque entra na mão de obra (não vira material na OM)", () => {
    const t = quoteTotals([svc(1, 100), mat(2, 25, null)]);
    expect(t.services).toBe(150);
    expect(t.materials).toBe(0);
    expect(becomesOmMaterial({ kind: "material", productId: null })).toBe(false);
    expect(becomesOmMaterial({ kind: "material", productId: "x" })).toBe(true);
    expect(becomesOmMaterial({ kind: "servico", productId: "x" })).toBe(false);
  });

  it("quantidades fracionadas somam como a OM soma os materiais (arredonda no fim)", () => {
    // 1,5 m × 33,33 + 2,25 kg × 41,10 = 49,995 + 92,475 = 142,47
    const t = quoteTotals([mat(1.5, 33.33), mat(2.25, 41.1)]);
    expect(t.materials).toBe(142.47);
    expect(t.total).toBe(142.47);
  });

  it("desconto negativo ou vazio vale zero", () => {
    expect(quoteTotals([svc(1, 80)], -10).discount).toBe(0);
    expect(quoteTotals([svc(1, 80)], Number.NaN).total).toBe(80);
  });

  it("orçamento sem itens fica zerado", () => {
    expect(quoteTotals([])).toEqual({ services: 0, materials: 0, subtotal: 0, discount: 0, total: 0, labor: 0 });
  });
});

describe("discountFits", () => {
  it("aceita desconto até o valor dos serviços", () => {
    expect(discountFits(quoteTotals([svc(1, 200), mat(1, 500)], 200))).toBe(true);
    expect(discountFits(quoteTotals([svc(1, 200), mat(1, 500)], 200.01))).toBe(false);
    expect(discountFits(quoteTotals([mat(1, 500)], 1))).toBe(false);
  });
});

describe("effectiveQuoteStatus", () => {
  it("rascunho ou enviado com validade antes de hoje aparece como vencido", () => {
    expect(effectiveQuoteStatus("enviado", "2026-11-09", "2026-11-10")).toBe("vencido");
    expect(effectiveQuoteStatus("rascunho", "2026-11-09", "2026-11-10")).toBe("vencido");
  });
  it("no último dia ainda vale", () => {
    expect(effectiveQuoteStatus("enviado", "2026-11-10", "2026-11-10")).toBe("enviado");
  });
  it("aprovado, recusado e cancelado não vencem", () => {
    for (const s of ["aprovado", "recusado", "cancelado"] as const) {
      expect(effectiveQuoteStatus(s, "2026-01-01", "2026-11-10")).toBe(s);
    }
  });
});

describe("daysToExpire", () => {
  it("conta os dias até a validade", () => {
    expect(daysToExpire("2026-11-25", "2026-11-10")).toBe(15);
    expect(daysToExpire("2026-11-10", "2026-11-10")).toBe(0);
    expect(daysToExpire("2026-11-08", "2026-11-10")).toBe(-2);
  });
});
