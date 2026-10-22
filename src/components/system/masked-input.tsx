"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { normalizeDocument, onlyDigits } from "@/lib/format";

/**
 * cpf: só números (11). cnpj: 12 caracteres [0-9A-Z] + 2 dígitos (CNPJ alfanumérico).
 * cpfcnpj: CPF enquanto tiver só números e até 11 dígitos; com letra ou mais de 11, CNPJ.
 */
type Mask = "cpfcnpj" | "cpf" | "cnpj" | "phone" | "cep" | "money";

function cpfLayout(d: string) {
  return d
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function cnpjLayout(raw: string) {
  const n = normalizeDocument(raw);
  // os 2 últimos (dígitos verificadores) são sempre números
  const v = (n.slice(0, 12) + n.slice(12).replace(/\D/g, "")).slice(0, 14);
  const parts = [v.slice(0, 2), v.slice(2, 5), v.slice(5, 8), v.slice(8, 12), v.slice(12, 14)];
  const seps = ["", ".", ".", "/", "-"];
  return parts.map((p, i) => (p ? seps[i] + p : "")).join("");
}

function apply(mask: Mask, raw: string, prev = "") {
  const d = onlyDigits(raw);
  switch (mask) {
    case "cpf":
      return cpfLayout(d);
    case "cnpj":
      return cnpjLayout(raw);
    case "cpfcnpj": {
      const n = normalizeDocument(raw);
      return /^\d{0,11}$/.test(n) ? cpfLayout(n) : cnpjLayout(n);
    }
    case "phone": {
      // Colado no formato internacional (+55 11 98765-4321): tira o código do país.
      // Só não tira quando é um dígito a mais digitado num número já completo com DDD 55.
      const typedOneMore = d.length === 12 && onlyDigits(prev).length === 11 && !raw.trimStart().startsWith("+");
      const p = (d.length === 12 || d.length === 13) && d.startsWith("55") && !typedOneMore ? d.slice(2) : d;
      return p.length <= 10
        ? p.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2")
        : p.slice(0, 11).replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
    }
    case "cep":
      return d.slice(0, 8).replace(/(\d{5})(\d{1,3})$/, "$1-$2");
    case "money": {
      if (!d) return raw.trim().startsWith("-") ? "-" : "";
      const n = Number(d) / 100;
      const sign = raw.trim().startsWith("-") ? "-" : "";
      return sign + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
}

const NUMERIC_MASKS: Mask[] = ["money", "cep", "phone", "cpf"];

/** Input com máscara brasileira. O valor enviado no formulário é o texto mascarado. */
export function MaskedInput({
  mask,
  defaultValue,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "onChange" | "value" | "defaultValue"> & { mask: Mask; defaultValue?: string | number | null }) {
  const initial =
    defaultValue == null || defaultValue === ""
      ? ""
      : mask === "money"
        ? Number(defaultValue).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : apply(mask, String(defaultValue));
  const [value, setValue] = useState(initial);
  const isDocument = mask === "cnpj" || mask === "cpfcnpj";
  return (
    <Input
      autoCapitalize={isDocument ? "characters" : undefined}
      autoCorrect={isDocument ? "off" : undefined}
      spellCheck={isDocument ? false : undefined}
      {...props}
      inputMode={NUMERIC_MASKS.includes(mask) ? "numeric" : props.inputMode}
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        setValue((prev) => apply(mask, raw, prev));
      }}
    />
  );
}
