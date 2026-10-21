"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { CheckCheck, ChevronDown, Loader2, Printer, RotateCcw, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Field, SubmitButton, useActionToast } from "@/components/system/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/action";
import { TRANSITIONS, type WorkOrderStatus } from "@/server/core/work-order-flow";
import { cancelOmAction, changeStatusAction, completeOmAction, reopenOmAction } from "../../actions";
import { NOT_ASSIGNABLE, transitionLabel } from "../../_lib/constants";
import { AssignDialog, type Absence } from "./assign-dialog";

function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  submitLabel,
  action,
  destructive,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  destructive?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  useActionToast(state, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans text-base font-semibold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <Field label={label} htmlFor="reason" error={state.fieldErrors?.reason} required>
            <Textarea id="reason" name="reason" rows={3} placeholder={placeholder} maxLength={500} autoFocus />
          </Field>
          <DialogFooter className="-mx-4 -mb-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Voltar
            </Button>
            <SubmitButton className={destructive ? "bg-gauge-red text-white hover:bg-gauge-red/90" : undefined}>{submitLabel}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OmActions({
  id,
  status,
  technicians,
  absences,
  schedule,
  pendingTasks,
}: {
  id: string;
  status: WorkOrderStatus;
  technicians: { id: string; name: string }[];
  absences: Absence[];
  schedule: { technicianId: string | null; scheduledDate: string | null; scheduledTime: string | null };
  pendingTasks: number;
}) {
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | "cancel" | "reopen" | "complete">(null);

  const run = (to: WorkOrderStatus) =>
    start(async () => {
      const r = await changeStatusAction(id, to);
      if (r.ok) toast.success(r.message ?? "Status alterado");
      else toast.error(r.error ?? "Não foi possível alterar o status.");
    });

  const complete = () =>
    start(async () => {
      const r = await completeOmAction(id);
      if (r.ok) {
        toast.success(r.message ?? "OM concluída");
        setDialog(null);
      } else {
        toast.error(r.error ?? "Não foi possível concluir a OM.", { duration: 8000 });
        setDialog(null);
      }
    });

  const next = TRANSITIONS[status] ?? [];
  // Concluída só volta pela reabertura (estorna comissão); cancelada volta pelo botão "Reativar OM".
  const menu =
    status === "concluida" || status === "cancelada"
      ? []
      : next.filter((to) => to !== "concluida" && to !== "cancelada");
  const canCancel = next.includes("cancelada");

  return (
    <>
      {!NOT_ASSIGNABLE.has(status) && (
        <AssignDialog id={id} technicians={technicians} absences={absences} initial={schedule} variant={status === "aberta" ? "default" : "outline"} />
      )}
      {status === "em_execucao" && (
        <Button className="h-9" onClick={() => setDialog("complete")} disabled={pending}>
          <CheckCheck className="size-4" />
          Concluir pela central
        </Button>
      )}
      {status === "concluida" && (
        <Button variant="outline" className="h-9" onClick={() => setDialog("reopen")}>
          <RotateCcw className="size-4" />
          Reabrir OM
        </Button>
      )}
      {status === "cancelada" && (
        <Button variant="outline" className="h-9" onClick={() => run("aberta")} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
          Reativar OM
        </Button>
      )}
      <Button variant="outline" className="h-9" asChild>
        <Link href={`/relatorios/om/${id}`} target="_blank" rel="noopener">
          <Printer className="size-4" />
          Imprimir relatório
        </Link>
      </Button>
      {(menu.length > 0 || canCancel) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Mudar status
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            {menu.map((to) => (
              <DropdownMenuItem key={to} onSelect={() => run(to)} className="py-1.5">
                {transitionLabel(status, to)}
              </DropdownMenuItem>
            ))}
            {canCancel && (
              <>
                {menu.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("cancel")} className="py-1.5">
                  <XCircle className="size-4" />
                  Cancelar OM
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ReasonDialog
        open={dialog === "cancel"}
        onOpenChange={(v) => setDialog(v ? "cancel" : null)}
        title="Cancelar OM"
        description="A OM sai da agenda do técnico, os materiais lançados voltam ao estoque e a comissão prevista é cancelada."
        label="Motivo do cancelamento"
        placeholder="Ex.: cliente desmarcou e vai reagendar pelo portal."
        submitLabel="Cancelar OM"
        action={cancelOmAction.bind(null, id)}
        destructive
      />
      <ReasonDialog
        open={dialog === "reopen"}
        onOpenChange={(v) => setDialog(v ? "reopen" : null)}
        title="Reabrir OM"
        description="A OM volta para execução e a comissão ainda não paga é estornada. Conclua de novo depois do ajuste."
        label="Motivo da reabertura"
        placeholder="Ex.: cliente relatou que o aparelho voltou a pingar."
        submitLabel="Reabrir OM"
        action={reopenOmAction.bind(null, id)}
      />
      <AlertDialog open={dialog === "complete"} onOpenChange={(v) => setDialog(v ? "complete" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-sans text-base font-semibold">Concluir OM pela central?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTasks > 0
                ? `Ainda há ${pendingTasks} item(ns) do checklist em aberto; a conclusão será recusada até que sejam preenchidos.`
                : "O sistema calcula o total, gera a cobrança avulsa (se faturável) e lança a comissão do técnico."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                complete();
              }}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Concluir OM
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
