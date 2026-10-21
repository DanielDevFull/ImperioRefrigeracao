"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action";

/**
 * Botão que pede confirmação e executa uma Server Action sem formulário.
 * `action` deve ser uma Server Action já vinculada (ex.: cancelar.bind(null, id)).
 */
export function ConfirmAction({
  action,
  title,
  description,
  confirmLabel,
  success,
  children,
  variant = "outline",
  size = "sm",
  destructive = false,
  className,
}: {
  action: () => Promise<ActionState>;
  title: string;
  description?: string;
  confirmLabel: string;
  success?: string;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  destructive?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "bg-gauge-red text-white hover:bg-gauge-red/90" : undefined}
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await action();
                if (r.ok === false || r.error) toast.error(r.error ?? "Não foi possível concluir.");
                else {
                  toast.success(r.message ?? success ?? "Feito");
                  setOpen(false);
                }
              });
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
