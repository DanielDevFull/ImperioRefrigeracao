"use client";

import { useRef, useState } from "react";
import { CircleCheck, Loader2, MapPin } from "lucide-react";
import { Field } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type SiteValues = {
  name?: string | null;
  zip?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  accessNotes?: string | null;
  areaM2?: number | null;
  occupants?: number | null;
};

type ViaCep = { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean | string };

/** Campos de endereço do local de atendimento, com preenchimento pelo CEP (ViaCEP). */
export function SiteFields({
  prefix = "",
  defaults = {},
  errors = {},
  compact = false,
}: {
  prefix?: string;
  defaults?: SiteValues;
  errors?: Record<string, string>;
  /** Layout mais estreito (diálogo) */
  compact?: boolean;
}) {
  const n = (k: string) => `${prefix}${k}`;
  const err = (k: string) => errors[n(k)];
  const [street, setStreet] = useState(defaults.street ?? "");
  const [district, setDistrict] = useState(defaults.district ?? "");
  const [city, setCity] = useState(defaults.city ?? "");
  const [uf, setUf] = useState(defaults.state ?? "");
  const [lookup, setLookup] = useState<"idle" | "loading" | "found" | "missing" | "error">("idle");
  const lastCep = useRef<string | null>(null);
  const numberRef = useRef<HTMLInputElement>(null);

  async function findCep(raw: string) {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8 || cep === lastCep.current) return;
    lastCep.current = cep;
    setLookup("loading");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = (await res.json()) as ViaCep;
      if (!res.ok || data.erro) {
        setLookup("missing");
        return;
      }
      if (data.logradouro) setStreet(data.logradouro);
      if (data.bairro) setDistrict(data.bairro);
      if (data.localidade) setCity(data.localidade);
      if (data.uf) setUf(data.uf);
      setLookup("found");
      if (data.logradouro) numberRef.current?.focus();
    } catch {
      setLookup("error");
    }
  }

  const id = (k: string) => `${prefix.replace(/\W/g, "-")}${k}`;
  const grid = compact ? "grid gap-4 sm:grid-cols-6" : "grid gap-4 sm:grid-cols-6 lg:grid-cols-12";
  const span = (sm: string, lg: string) => cn(sm, !compact && lg);

  return (
    <div className="space-y-4">
      <div className={grid}>
        <Field
          label="Nome do local"
          htmlFor={id("name")}
          error={err("name")}
          hint="Como a equipe reconhece o endereço"
          className={span("sm:col-span-3", "lg:col-span-4")}
          required
        >
          <Input
            id={id("name")}
            name={n("name")}
            defaultValue={defaults.name ?? (prefix ? "Principal" : "")}
            placeholder="Matriz, Loja 2, Residência"
            className="h-9"
          />
        </Field>
        <Field
          label="CEP"
          htmlFor={id("zip")}
          error={err("zip")}
          className={span("sm:col-span-3", "lg:col-span-3")}
        >
          <div className="relative">
            <MaskedInput
              id={id("zip")}
              name={n("zip")}
              mask="cep"
              defaultValue={defaults.zip ?? undefined}
              placeholder="00000-000"
              className="h-9 pr-9"
              autoComplete="postal-code"
              onInput={(e) => findCep(e.currentTarget.value)}
              onBlur={(e) => findCep(e.currentTarget.value)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center">
              {lookup === "loading" ? (
                <Loader2 className="size-4 animate-spin text-steel" />
              ) : lookup === "found" ? (
                <CircleCheck className="size-4 text-mint" />
              ) : (
                <MapPin className="size-4 text-steel/70" />
              )}
            </span>
          </div>
          <p
            className={cn(
              "text-xs",
              lookup === "missing" || lookup === "error" ? "text-brass" : "text-steel",
            )}
            aria-live="polite"
          >
            {lookup === "missing"
              ? "CEP não encontrado. Preencha o endereço à mão."
              : lookup === "error"
                ? "Não deu para consultar o CEP agora. Preencha à mão."
                : lookup === "found"
                  ? "Endereço preenchido pelo CEP."
                  : "Digite o CEP para preencher o endereço."}
          </p>
        </Field>
        <Field
          label="Logradouro"
          htmlFor={id("street")}
          error={err("street")}
          className={span("sm:col-span-6", "lg:col-span-5")}
        >
          <Input
            id={id("street")}
            name={n("street")}
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="Rua, avenida…"
            className="h-9"
            autoComplete="address-line1"
          />
        </Field>
        <Field label="Número" htmlFor={id("number")} error={err("number")} className={span("sm:col-span-2", "lg:col-span-2")}>
          <Input id={id("number")} ref={numberRef} name={n("number")} defaultValue={defaults.number ?? ""} className="h-9" />
        </Field>
        <Field
          label="Complemento"
          htmlFor={id("complement")}
          error={err("complement")}
          className={span("sm:col-span-4", "lg:col-span-3")}
        >
          <Input
            id={id("complement")}
            name={n("complement")}
            defaultValue={defaults.complement ?? ""}
            placeholder="Sala, bloco, andar"
            className="h-9"
          />
        </Field>
        <Field label="Bairro" htmlFor={id("district")} error={err("district")} className={span("sm:col-span-3", "lg:col-span-3")}>
          <Input
            id={id("district")}
            name={n("district")}
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="h-9"
          />
        </Field>
        <Field label="Cidade" htmlFor={id("city")} error={err("city")} className={span("sm:col-span-2", "lg:col-span-3")}>
          <Input
            id={id("city")}
            name={n("city")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="h-9"
            autoComplete="address-level2"
          />
        </Field>
        <Field label="UF" htmlFor={id("state")} error={err("state")} className={span("sm:col-span-1", "lg:col-span-1")}>
          <Input
            id={id("state")}
            name={n("state")}
            value={uf}
            onChange={(e) => setUf(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
            maxLength={2}
            placeholder="SP"
            className="h-9 uppercase"
            autoComplete="address-level1"
          />
        </Field>
      </div>

      <div className={grid}>
        <Field
          label="Instruções de acesso"
          htmlFor={id("accessNotes")}
          error={err("accessNotes")}
          hint="Portaria, horários, onde ficam as condensadoras"
          className={span("sm:col-span-6", "lg:col-span-8")}
        >
          <Textarea
            id={id("accessNotes")}
            name={n("accessNotes")}
            defaultValue={defaults.accessNotes ?? ""}
            rows={2}
            placeholder="Ex.: procurar a recepção; acesso à cobertura pela escada de serviço."
          />
        </Field>
        <Field
          label="Área climatizada (m²)"
          htmlFor={id("areaM2")}
          error={err("areaM2")}
          hint="Usada no PMOC"
          className={span("sm:col-span-3", "lg:col-span-2")}
        >
          <Input
            id={id("areaM2")}
            name={n("areaM2")}
            inputMode="decimal"
            defaultValue={defaults.areaM2 != null ? String(defaults.areaM2).replace(".", ",") : ""}
            placeholder="0"
            className="h-9 tabular-nums"
          />
        </Field>
        <Field
          label="Ocupantes"
          htmlFor={id("occupants")}
          error={err("occupants")}
          hint="Pessoas no ambiente"
          className={span("sm:col-span-3", "lg:col-span-2")}
        >
          <Input
            id={id("occupants")}
            name={n("occupants")}
            inputMode="numeric"
            defaultValue={defaults.occupants ?? ""}
            placeholder="0"
            className="h-9 tabular-nums"
          />
        </Field>
      </div>
    </div>
  );
}
