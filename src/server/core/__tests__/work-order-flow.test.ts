import { describe, expect, it } from "vitest";
import { canTransition, primaryAction } from "../work-order-flow";

describe("fluxo da OM", () => {
  it("segue o caminho principal do técnico", () => {
    expect(primaryAction("agendada")?.to).toBe("em_deslocamento");
    expect(primaryAction("em_deslocamento")?.to).toBe("em_execucao");
    expect(primaryAction("em_execucao")?.to).toBe("concluida");
    expect(primaryAction("concluida")).toBeNull();
  });
  it("não reabre OM concluída por mudança de status comum", () => {
    expect(canTransition("concluida", "em_execucao")).toBe(false);
  });
  it("não cancela OM em execução sem pausar", () => {
    expect(canTransition("em_execucao", "cancelada")).toBe(false);
    expect(canTransition("pausada", "cancelada")).toBe(true);
  });
});
