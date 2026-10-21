"use client";

import { startTransition, useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { initialActionState, type ActionState } from "@/lib/action";

/**
 * useActionState disparado pelo onSubmit (em vez de <form action>), para o React não
 * limpar os campos quando a ação devolve erro de validação.
 */
export function useFormSubmit(action: (prev: ActionState, fd: FormData) => Promise<ActionState>) {
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
  size = "lg",
  variant,
  disabled,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
}) {
  return (
    <Button type="submit" size={size} variant={variant} className={className} disabled={pending || disabled}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}
