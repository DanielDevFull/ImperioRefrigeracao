"use client";

import { startTransition, useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type ActionState, initialActionState } from "@/lib/action";

/**
 * useActionState com envio manual: o React não limpa o formulário depois da ação,
 * então o que a pessoa digitou continua na tela quando a validação falha.
 */
export function useFormAction(
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>,
  initial: ActionState = initialActionState,
) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { state, onSubmit, pending };
}

/** Botão de envio para formulários com useFormAction (recebe o pending explicitamente). */
export function PendingButton({
  pending,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}
