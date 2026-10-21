"use client";

import { createContext, startTransition, useContext } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PendingContext = createContext(false);

/**
 * Formulário que envia para a Server Action (via useActionState) sem o reset automático
 * do React 19: quando a validação falha, o que a pessoa digitou continua no lugar.
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
