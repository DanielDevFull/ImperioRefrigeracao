"use client";

import { createContext, startTransition, useContext, useEffect, useRef } from "react";
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

/** Classe padrão para a caixa de seleção (SelectField de @/components/system/fields). */
export const nativeSelectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-silver shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 [&>option]:bg-night";

const PendingContext = createContext(false);

/**
 * Formulário ligado a uma Server Action (via useActionState) SEM o reset automático do React 19:
 * quando a validação falha, o que a pessoa digitou continua nos campos.
 * Uso: const [state, action, pending] = useActionState(acao, initialActionState);
 *      <ActionForm action={action} pending={pending}>…<FormSubmit>Salvar</FormSubmit></ActionForm>
 */
export function ActionForm({
  action,
  pending,
  className,
  children,
}: {
  action: (fd: FormData) => void;
  pending: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
    </form>
  );
}

/** Botão de envio do ActionForm, com indicador de carregamento. */
export function FormSubmit({ children, disabled, ...props }: React.ComponentProps<typeof Button>) {
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}
