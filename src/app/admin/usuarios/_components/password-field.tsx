"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const WORDS = ["Gelo", "Neve", "Brisa", "Polar", "Aurora", "Cristal", "Geada", "Inverno", "Glacial", "Frio"];

function randomInt(max: number) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

/** Senha provisória fácil de ditar: palavra + 4 dígitos + símbolo (ex.: Geada4821!). */
export function generatePassword() {
  const word = WORDS[randomInt(WORDS.length)];
  const digits = String(randomInt(10_000)).padStart(4, "0");
  const symbol = "!@#$%&*"[randomInt(7)];
  return `${word}${digits}${symbol}`;
}

export async function copyText(text: string, label = "Copiado") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
    return true;
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    return false;
  }
}

/** Campo de senha provisória com "Gerar" e "Mostrar". O valor vai no formulário como `name`. */
export function PasswordField({
  id,
  name = "password",
  value,
  onChange,
  invalid,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          className="pr-20 font-mono tracking-wide"
          minLength={8}
          required
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="grid size-7 place-items-center rounded-md text-steel hover:text-frost"
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
          <button
            type="button"
            disabled={!value}
            onClick={async () => {
              if (await copyText(value, "Senha copiada")) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
            className="grid size-7 place-items-center rounded-md text-steel hover:text-frost disabled:opacity-40"
            aria-label="Copiar senha"
          >
            {copied ? <Check className="size-4 text-mint" /> : <Copy className="size-4" />}
          </button>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onChange(generatePassword());
          setShow(true);
        }}
      >
        <Sparkles className="size-4" />
        Gerar
      </Button>
    </div>
  );
}
