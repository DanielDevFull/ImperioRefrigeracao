"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

/** Botão de envio que mostra carregamento enquanto a ação roda. */
export function SubmitButton({
  children,
  className,
  variant,
  size,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className={className} variant={variant} size={size} disabled={pending || disabled}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

export function FieldError({ state, name, className }: { state: ActionState; name: string; className?: string }) {
  const msg = state.fieldErrors?.[name];
  if (!msg) return null;
  return <p className={cn("mt-1 text-xs text-gauge-red", className)}>{msg}</p>;
}

/** Mostra toast de sucesso/erro quando o estado da ação muda. */
export function useActionToast(state: ActionState, opts: { success?: string; onSuccess?: () => void } = {}) {
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.ok) {
      toast.success(state.message ?? opts.success ?? "Salvo");
      opts.onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, opts]);
}

/** Bloco de campo: rótulo, controle, dica e erro. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
  required,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-silver">
        {label}
        {required && <span className="ml-0.5 text-ice">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-steel">{hint}</p>}
      {error && <p className="text-xs text-gauge-red">{error}</p>}
    </div>
  );
}

/** Classe padrão para <select> nativo no tema. */
export const nativeSelectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-silver shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 [&>option]:bg-night";
