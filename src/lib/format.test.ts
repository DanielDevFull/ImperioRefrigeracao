import { describe, expect, it } from "vitest";
import { formatDocument, formatPhone, normalizeDocument, normalizePhone, whatsappLink } from "./format";

describe("documentos", () => {
  it("normalizeDocument mantém letras em maiúsculas e tira a pontuação", () => {
    expect(normalizeDocument("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(normalizeDocument("529.982.247-25")).toBe("52998224725");
    expect(normalizeDocument(null)).toBe("");
  });

  it("formatDocument formata CPF, CNPJ numérico e alfanumérico", () => {
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatDocument("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    expect(formatDocument("123")).toBe("123");
    expect(formatDocument(null)).toBe("—");
  });
});

describe("telefones", () => {
  it("normalizePhone tira o +55 de números internacionais", () => {
    expect(normalizePhone("+55 11 98765-4321")).toBe("11987654321");
    expect(normalizePhone("+55 11 3333-4444")).toBe("1133334444");
    expect(normalizePhone("(55) 99999-8888")).toBe("55999998888");
    expect(formatPhone("5511987654321")).toBe("(11) 98765-4321");
  });

  it("whatsappLink põe o 55 pelo tamanho, inclusive com DDD 55", () => {
    expect(whatsappLink("(11) 98765-4321")).toBe("https://wa.me/5511987654321");
    expect(whatsappLink("55999998888")).toBe("https://wa.me/5555999998888");
    expect(whatsappLink("+55 11 98765-4321")).toBe("https://wa.me/5511987654321");
    expect(whatsappLink("")).toBeNull();
  });
});
