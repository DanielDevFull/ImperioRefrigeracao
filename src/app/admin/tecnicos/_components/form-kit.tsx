"use client";

import { startTransition, useActionState, useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ActionState, initialActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

/**
 * useActionState sem o reset automático do formulário do React 19:
 * em erro de validação os campos continuam preenchidos.
 */
export function useFormAction(action: (prev: ActionState, fd: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(action, initialActionState);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { state, onSubmit, pending };
}

export function PendingButton({
  pending,
  children,
  className,
  variant,
  size,
  disabled,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
}) {
  return (
    <Button type="submit" className={className} variant={variant} size={size} disabled={pending || disabled}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

const WORDS = ["gelo", "frio", "neve", "brisa", "geada", "polar", "cristal", "inverno", "serpentina", "manifold"];

/** Senha temporária fácil de ditar por telefone: palavra + 4 dígitos. */
export function generatePassword() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const word = WORDS[buf[0] % WORDS.length];
  const digits = String(buf[1] % 10000).padStart(4, "0");
  return `${word}-${digits}`;
}

/** Campo de senha temporária com gerador, mostrar/ocultar e copiar. */
export function TempPasswordInput({
  id,
  name,
  invalid,
  defaultValue = "",
}: {
  id: string;
  name: string;
  invalid?: boolean;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [show, setShow] = useState(true);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={invalid || undefined}
          className="pr-16 font-mono"
          placeholder="mínimo 6 caracteres"
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="grid size-7 place-items-center rounded text-steel hover:text-frost"
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          >
            {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <button
            type="button"
            disabled={!value}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                toast.error("Não foi possível copiar. Selecione e copie a senha manualmente.");
              }
            }}
            className="grid size-7 place-items-center rounded text-steel hover:text-frost disabled:opacity-40"
            aria-label="Copiar senha"
          >
            {copied ? <Check className="size-3.5 text-mint" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setValue(generatePassword());
          setShow(true);
        }}
      >
        <RefreshCw />
        Gerar
      </Button>
    </div>
  );
}

export function FormError({ state, className }: { state: ActionState; className?: string }) {
  if (!state.error) return null;
  return (
    <p role="alert" className={cn("rounded-lg border border-gauge-red/30 bg-gauge-red/8 px-3 py-2 text-sm text-gauge-red", className)}>
      {state.error}
    </p>
  );
}
