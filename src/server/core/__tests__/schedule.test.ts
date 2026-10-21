import { describe, expect, it } from "vitest";
import {
  dueDatesToGenerate,
  scheduleDateFor,
  tasksDueOn,
  upcomingVisits,
  visitIntervalMonths,
} from "../schedule";

const tasks = [
  { id: "a", title: "Filtros", frequencyMonths: 1, position: 1 },
  { id: "b", title: "Serpentina", frequencyMonths: 3, position: 2 },
  { id: "c", title: "Higienização completa", frequencyMonths: 6, position: 3 },
  { id: "d", title: "Laudo anual", frequencyMonths: 12, position: 4 },
];

describe("visitIntervalMonths", () => {
  it("usa a menor frequência", () => {
    expect(visitIntervalMonths(tasks)).toBe(1);
    expect(visitIntervalMonths([{ frequencyMonths: 3 }, { frequencyMonths: 6 }])).toBe(3);
    expect(visitIntervalMonths([])).toBe(1);
  });
});

describe("dueDatesToGenerate", () => {
  it("gera as datas dentro do horizonte a partir da âncora", () => {
    expect(
      dueDatesToGenerate({
        anchor: "2026-10-15",
        intervalMonths: 1,
        lastGenerated: null,
        notBefore: "2026-10-01",
        until: "2026-12-20",
      }),
    ).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"]);
  });

  it("não repete o que já foi gerado (idempotência)", () => {
    expect(
      dueDatesToGenerate({
        anchor: "2026-01-10",
        intervalMonths: 3,
        lastGenerated: "2026-10-10",
        notBefore: "2026-10-01",
        until: "2027-02-01",
      }),
    ).toEqual(["2027-01-10"]);
  });

  it("não cria histórico atrasado antes de notBefore", () => {
    const r = dueDatesToGenerate({
      anchor: "2024-01-05",
      intervalMonths: 1,
      lastGenerated: null,
      notBefore: "2026-10-10",
      until: "2026-11-10",
    });
    expect(r).toEqual(["2026-11-05"]);
  });

  it("mantém o dia 31 da âncora usando o último dia em meses curtos", () => {
    expect(
      dueDatesToGenerate({
        anchor: "2026-01-31",
        intervalMonths: 1,
        lastGenerated: null,
        notBefore: "2026-01-01",
        until: "2026-04-30",
      }),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("âncora no futuro além do horizonte não gera nada", () => {
    expect(
      dueDatesToGenerate({
        anchor: "2027-05-01",
        intervalMonths: 1,
        lastGenerated: null,
        notBefore: "2026-10-01",
        until: "2026-11-30",
      }),
    ).toEqual([]);
  });
});

describe("tasksDueOn", () => {
  it("inclui as tarefas cujo ciclo cai no mês", () => {
    const ids = (d: string) => tasksDueOn(tasks, "2026-01-10", d).map((t) => t.id);
    expect(ids("2026-01-10")).toEqual(["a", "b", "c", "d"]);
    expect(ids("2026-02-10")).toEqual(["a"]);
    expect(ids("2026-04-10")).toEqual(["a", "b"]);
    expect(ids("2026-07-10")).toEqual(["a", "b", "c"]);
    expect(ids("2027-01-10")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("upcomingVisits", () => {
  it("lista as próximas visitas", () => {
    expect(upcomingVisits("2026-03-20", 3, "2026-10-21", 3)).toEqual([
      "2026-12-20",
      "2027-03-20",
      "2027-06-20",
    ]);
  });
});

describe("scheduleDateFor", () => {
  it("move domingo e sábado para sexta quando não atende sábado", () => {
    // 2026-11-01 é domingo; 2026-10-31 sábado
    expect(scheduleDateFor("2026-11-01", "2026-10-21", false)).toBe("2026-10-30");
    expect(scheduleDateFor("2026-10-31", "2026-10-21", false)).toBe("2026-10-30");
    expect(scheduleDateFor("2026-10-31", "2026-10-21", true)).toBe("2026-10-31");
  });
  it("vencimento no passado vai para hoje (ou próximo dia útil)", () => {
    expect(scheduleDateFor("2026-10-10", "2026-10-21", false)).toBe("2026-10-21");
    // hoje domingo → segunda
    expect(scheduleDateFor("2026-10-10", "2026-10-25", false)).toBe("2026-10-26");
  });
});
