"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

/** Como ConfirmAction, mas navega para `redirectTo` quando a ação dá certo (ex.: após excluir). */
export function ConfirmAndGo({
  action,
  title,
  description,
  confirmLabel,
  redirectTo,
  children,
  destructive = false,
  variant = "outline",
  size = "sm",
  className,
}: {
  action: () => Promise<ActionState>;
  title: string;
  description?: string;
  confirmLabel: string;
  redirectTo?: string;
  children: React.ReactNode;
  destructive?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const router = useRouter();
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
                if (r.ok === false || r.error) {
                  toast.error(r.error ?? "Não foi possível concluir.");
                  return;
                }
                toast.success(r.message ?? "Feito");
                setOpen(false);
                if (redirectTo) router.push(redirectTo);
                else router.refresh();
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
