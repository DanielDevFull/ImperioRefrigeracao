/**
 * Validação de CPF/CNPJ pelos dígitos verificadores (regra pura, usada no formulário e nas ações).
 * CNPJ alfanumérico (IN RFB 2.229/2024, desde julho de 2026): 12 caracteres [0-9A-Z] + 2 dígitos
 * verificadores, calculados com o valor (código ASCII − 48) de cada caractere e os mesmos pesos.
 * Para CNPJs só com números o cálculo é idêntico ao tradicional.
 */
import { normalizeDocument } from "@/lib/format";

const CNPJ_RE = /^[0-9A-Z]{12}\d{2}$/;

export function isValidCPF(value: string) {
  const d = normalizeDocument(value);
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCNPJ(value: string) {
  const d = normalizeDocument(value);
  if (!CNPJ_RE.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += (d.charCodeAt(i) - 48) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Devolve a mensagem de erro do documento, ou null quando está válido (ou vazio). */
export function documentError(personType: "pf" | "pj", value: string | null | undefined) {
  const d = normalizeDocument(value);
  if (!d) return null;
  if (personType === "pf") {
    if (!/^\d+$/.test(d)) return "O CPF tem só números. Confira o que foi digitado.";
    if (d.length !== 11) return "O CPF tem 11 dígitos. Confira o número digitado.";
    return isValidCPF(d) ? null : "CPF inválido: os dígitos verificadores não conferem.";
  }
  if (d.length !== 14) return "O CNPJ tem 14 caracteres. Confira o número digitado.";
  if (!/^\d{2}$/.test(d.slice(12))) return "CNPJ inválido: os dois últimos caracteres (dígitos verificadores) são números.";
  return isValidCNPJ(d) ? null : "CNPJ inválido: os dígitos verificadores não conferem.";
}

/** CPF ou CNPJ quando o tipo não é escolhido no formulário (fornecedor, empresa): deduz pelo formato. */
export function cpfOrCnpjError(value: string | null | undefined) {
  const d = normalizeDocument(value);
  if (!d) return null;
  if (/^\d{11}$/.test(d)) return documentError("pf", d);
  if (d.length === 14) return documentError("pj", d);
  return "Informe um CNPJ (14 caracteres) ou um CPF (11 dígitos).";
}
