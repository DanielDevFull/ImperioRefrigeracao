import { describe, expect, it } from "vitest";
import { competencesToBill, lateCharges, maxDaysOverdue } from "../billing";

describe("lateCharges", () => {
  it("sem atraso não cobra nada", () => {
    expect(
      lateCharges({ amount: 200, dueDate: "2026-10-10", paidOn: "2026-10-10", finePercent: 2, interestMonthlyPercent: 1 }),
    ).toEqual({ daysLate: 0, fine: 0, interest: 0, total: 200 });
  });
  it("multa de 2% + juros de 1% ao mês pró-rata", () => {
    const r = lateCharges({ amount: 300, dueDate: "2026-10-10", paidOn: "2026-10-25", finePercent: 2, interestMonthlyPercent: 1 });
    expect(r.daysLate).toBe(15);
    expect(r.fine).toBe(6);
    expect(r.interest).toBe(1.5);
    expect(r.total).toBe(307.5);
  });
});

describe("competencesToBill", () => {
  it("gera a competência quando faltam leadDays para o vencimento", () => {
    const r = competencesToBill({
      startDate: "2026-08-01",
      endDate: null,
      billingDay: 10,
      today: "2026-10-21",
      leadDays: 20,
      existing: new Set(["2026-09", "2026-10"]),
    });
    expect(r).toEqual([{ competence: "2026-11", dueDate: "2026-11-10" }]);
  });

  it("não gera competências muito antigas ao cadastrar contrato retroativo", () => {
    const r = competencesToBill({
      startDate: "2025-01-01",
      endDate: null,
      billingDay: 5,
      today: "2026-10-21",
      leadDays: 10,
      existing: new Set(),
    });
    expect(r.map((x) => x.competence)).toEqual(["2026-09", "2026-10"]);
  });

  it("respeita a data de término", () => {
    const r = competencesToBill({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      billingDay: 10,
      today: "2026-10-21",
      leadDays: 30,
      existing: new Set(),
    });
    expect(r.map((x) => x.competence)).toEqual(["2026-10"]);
  });

  it("não cria mensalidade com vencimento antes do início do contrato", () => {
    const r = competencesToBill({
      startDate: "2026-10-21",
      endDate: null,
      billingDay: 10,
      today: "2026-10-21",
      leadDays: 25,
      existing: new Set(),
    });
    expect(r).toEqual([{ competence: "2026-11", dueDate: "2026-11-10" }]);
  });

  it("é idempotente com as existentes", () => {
    const r = competencesToBill({
      startDate: "2026-10-01",
      endDate: null,
      billingDay: 28,
      today: "2026-10-21",
      leadDays: 15,
      existing: new Set(["2026-10"]),
    });
    expect(r).toEqual([]);
  });
});

describe("maxDaysOverdue", () => {
  it("retorna o maior atraso", () => {
    expect(maxDaysOverdue(["2026-10-01", "2026-10-15"], "2026-10-21")).toBe(20);
    expect(maxDaysOverdue([], "2026-10-21")).toBe(0);
  });
});
