/** Validação de CPF/CNPJ pelos dígitos verificadores (regra pura, usada no formulário e na ação). */

const digitsOf = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function isValidCPF(value: string) {
  const d = digitsOf(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCNPJ(value: string) {
  const d = digitsOf(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Devolve a mensagem de erro do documento, ou null quando está válido (ou vazio). */
export function documentError(personType: "pf" | "pj", value: string | null | undefined) {
  const d = digitsOf(value);
  if (!d) return null;
  if (personType === "pf") {
    if (d.length !== 11) return "O CPF tem 11 dígitos. Confira o número digitado.";
    return isValidCPF(d) ? null : "CPF inválido: os dígitos verificadores não conferem.";
  }
  if (d.length !== 14) return "O CNPJ tem 14 dígitos. Confira o número digitado.";
  return isValidCNPJ(d) ? null : "CNPJ inválido: os dígitos verificadores não conferem.";
}
