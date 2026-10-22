"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Power, PowerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/system/confirm-action";
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
import { deletePlan, setPlanActive } from "../actions";

export function PlanStatusActions({
  planId,
  planName,
  active,
  deactivateWarning,
  canDelete,
}: {
  planId: string;
  planName: string;
  active: boolean;
  deactivateWarning: string;
  canDelete: boolean;
}) {
  return (
    <>
      {active ? (
        <ConfirmAction
          action={setPlanActive.bind(null, planId, false)}
          title={`Desativar "${planName}"?`}
          description={deactivateWarning}
          confirmLabel="Desativar plano"
          destructive
        >
          <PowerOff />
          Desativar plano
        </ConfirmAction>
      ) : (
        <ConfirmAction
          action={setPlanActive.bind(null, planId, true)}
          title={`Reativar "${planName}"?`}
          description="Os contratos que usam este plano voltam a gerar OMs na próxima rotina diária (ou em Gerar OMs agora, no contrato)."
          confirmLabel="Reativar plano"
        >
          <Power />
          Reativar plano
        </ConfirmAction>
      )}
      {canDelete && <DeletePlanButton planId={planId} planName={planName} />}
    </>
  );
}

function DeletePlanButton({ planId, planName }: { planId: string; planName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-steel hover:bg-gauge-red/10 hover:text-gauge-red">
          <Trash2 />
          Excluir
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir &quot;{planName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            O plano nunca foi usado em contrato, então pode ser excluído com as tarefas e materiais. Esta ação não pode
            ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-gauge-red text-abyss hover:bg-gauge-red/90"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await deletePlan(planId);
                if (!r.ok) {
                  toast.error(r.error ?? "Não foi possível excluir o plano.");
                  return;
                }
                toast.success(r.message ?? "Plano excluído");
                setOpen(false);
                router.push("/admin/planos");
              });
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Excluir plano
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
