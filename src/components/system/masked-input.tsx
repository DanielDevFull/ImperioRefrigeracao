"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { onlyDigits } from "@/lib/format";

type Mask = "cpfcnpj" | "phone" | "cep" | "money";

function apply(mask: Mask, raw: string) {
  const d = onlyDigits(raw);
  switch (mask) {
    case "cpfcnpj":
      if (d.length <= 11)
        return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
      return d
        .slice(0, 14)
        .replace(/(\d{2})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1/$2")
        .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
    case "phone":
      return d.length <= 10
        ? d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2")
        : d.slice(0, 11).replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
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
  return (
    <Input
      {...props}
      inputMode={mask === "money" || mask === "cep" || mask === "phone" ? "numeric" : props.inputMode}
      value={value}
      onChange={(e) => setValue(apply(mask, e.target.value))}
    />
  );
}
