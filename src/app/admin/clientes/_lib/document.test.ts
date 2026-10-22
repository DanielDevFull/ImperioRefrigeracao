import { describe, expect, it } from "vitest";
import { cpfOrCnpjError, documentError, isValidCNPJ, isValidCPF } from "./document";

describe("isValidCPF", () => {
  it("aceita CPF válido, com ou sem pontuação", () => {
    expect(isValidCPF("52998224725")).toBe(true);
    expect(isValidCPF("529.982.247-25")).toBe(true);
  });

  it("recusa dígitos verificadores errados, repetidos, letras e tamanho errado", () => {
    expect(isValidCPF("52998224726")).toBe(false);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("5299822472A")).toBe(false);
    expect(isValidCPF("5299822472")).toBe(false);
  });
});

describe("isValidCNPJ", () => {
  it("aceita CNPJ numérico", () => {
    expect(isValidCNPJ("11222333000181")).toBe(true);
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
  });

  it("aceita CNPJ alfanumérico (exemplo da Receita: 12.ABC.345/01DE-35)", () => {
    expect(isValidCNPJ("12ABC34501DE35")).toBe(true);
    expect(isValidCNPJ("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCNPJ("12.abc.345/01de-35")).toBe(true);
    expect(isValidCNPJ("A1B2C3D4E5F668")).toBe(true);
  });

  it("recusa dígitos verificadores errados, letras nos verificadores, repetidos e tamanho errado", () => {
    expect(isValidCNPJ("11222333000182")).toBe(false);
    expect(isValidCNPJ("12ABC34501DE36")).toBe(false);
    expect(isValidCNPJ("12ABC34501DE3A")).toBe(false);
    expect(isValidCNPJ("00000000000000")).toBe(false);
    expect(isValidCNPJ("12ABC34501DE3")).toBe(false);
    expect(isValidCNPJ("")).toBe(false);
  });
});

describe("documentError", () => {
  it("vazio não é erro", () => {
    expect(documentError("pj", "")).toBeNull();
    expect(documentError("pf", null)).toBeNull();
  });

  it("valida conforme o tipo de pessoa", () => {
    expect(documentError("pf", "529.982.247-25")).toBeNull();
    expect(documentError("pj", "12.ABC.345/01DE-35")).toBeNull();
    expect(documentError("pj", "11.222.333/0001-81")).toBeNull();
    expect(documentError("pf", "12ABC34501DE35")).toMatch(/só números/);
    expect(documentError("pf", "5299822472")).toMatch(/11 dígitos/);
    expect(documentError("pj", "12ABC34501DE")).toMatch(/14 caracteres/);
    expect(documentError("pj", "12ABC34501DEAB")).toMatch(/últimos caracteres/);
    expect(documentError("pj", "12ABC34501DE36")).toMatch(/verificadores não conferem/);
  });
});

describe("cpfOrCnpjError", () => {
  it("deduz CPF ou CNPJ pelo formato", () => {
    expect(cpfOrCnpjError("52998224725")).toBeNull();
    expect(cpfOrCnpjError("12ABC34501DE35")).toBeNull();
    expect(cpfOrCnpjError("52998224726")).toMatch(/CPF inválido/);
    expect(cpfOrCnpjError("12ABC34501DE36")).toMatch(/CNPJ inválido/);
    expect(cpfOrCnpjError("1234")).toMatch(/14 caracteres/);
  });
});
