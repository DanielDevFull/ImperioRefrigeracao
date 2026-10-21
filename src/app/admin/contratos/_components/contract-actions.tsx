"use client";

import { useActionState, useState, useTransition } from "react";
import { Ban, Pause, Pencil, Play, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/system/confirm-action";
import { Field, SubmitButton, useActionToast } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { cancelContract, generateContractWorkOrders, reactivateContract, suspendContract, updateContract } from "../actions";

type ContractInfo = {
  id: string;
  name: string;
  status: string;
  monthlyAmount: number;
  billingDay: number;
  startDate: string;
  endDate: string | null;
  notes: string | null;
};

export function GenerateNowButton({ contractId, disabled }: { contractId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const r = await generateContractWorkOrders(contractId);
          if (!r.ok) toast.error(r.error ?? "Não foi possível gerar as OMs.");
          else toast.success(r.message ?? "OMs geradas");
        })
      }
    >
      <RefreshCcw className={pending ? "animate-spin" : undefined} />
      Gerar OMs agora
    </Button>
  );
}

export function EditContractButton({ contract }: { contract: ContractInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil />
          Editar dados
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar dados do contrato</DialogTitle>
          <DialogDescription>
            Mensalidades já geradas mantêm o valor e o vencimento; as mudanças valem para as próximas.
          </DialogDescription>
        </DialogHeader>
        {open && <EditContractForm contract={contract} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditContractForm({ contract, onDone }: { contract: ContractInfo; onDone: () => void }) {
  const [state, action] = useActionState(updateContract.bind(null, contract.id), initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Nome do contrato" htmlFor="ec-name" required error={fe.name} className="sm:col-span-2">
        <Input id="ec-name" name="name" defaultValue={contract.name} className="h-9" maxLength={120} />
      </Field>
      <Field label="Mensalidade" htmlFor="ec-amount" required error={fe.monthlyAmount}>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-steel">R$</span>
          <MaskedInput id="ec-amount" name="monthlyAmount" mask="money" defaultValue={contract.monthlyAmount} className="h-9 pl-9 tabular-nums" />
        </div>
      </Field>
      <Field label="Dia de vencimento" htmlFor="ec-day" required error={fe.billingDay} hint="De 1 a 28.">
        <Input id="ec-day" name="billingDay" type="number" min={1} max={28} defaultValue={contract.billingDay} className="h-9 tabular-nums" />
      </Field>
      <Field label="Término" htmlFor="ec-end" error={fe.endDate} hint="Deixe vazio para renovar todo mês." className="sm:col-span-2">
        <Input id="ec-end" name="endDate" type="date" min={contract.startDate} defaultValue={contract.endDate ?? ""} className="h-9 sm:w-48" />
      </Field>
      <Field label="Observações" htmlFor="ec-notes" error={fe.notes} className="sm:col-span-2">
        <Textarea id="ec-notes" name="notes" defaultValue={contract.notes ?? ""} rows={3} maxLength={2000} />
      </Field>
      <DialogFooter className="sm:col-span-2">
        <SubmitButton className="h-9 px-4">Salvar contrato</SubmitButton>
      </DialogFooter>
    </form>
  );
}

export function ContractStatusActions({
  contract,
  cancelCount,
  activeItems,
}: {
  contract: ContractInfo;
  cancelCount: number;
  activeItems: number;
}) {
  const closed = contract.status === "cancelado" || contract.status === "encerrado";
  if (closed) return null;
  const omsText =
    cancelCount === 0
      ? "Não há OMs futuras abertas ou agendadas para cancelar."
      : cancelCount === 1
        ? "1 OM futura (aberta ou agendada) será cancelada."
        : `${cancelCount} OMs futuras (abertas ou agendadas) serão canceladas.`;
  return (
    <>
      {contract.status === "ativo" && (
        <ConfirmAction
          action={suspendContract.bind(null, contract.id)}
          title="Suspender o contrato?"
          description="Enquanto suspenso, a rotina diária não gera mensalidades nem OMs para ele. As OMs já geradas continuam na agenda. Você pode reativar quando quiser."
          confirmLabel="Suspender contrato"
        >
          <Pause />
          Suspender
        </ConfirmAction>
      )}
      {contract.status === "suspenso" && (
        <ConfirmAction
          action={reactivateContract.bind(null, contract.id)}
          title="Reativar o contrato?"
          description="A mensalidade do período e as OMs do horizonte configurado são geradas logo em seguida."
          confirmLabel="Reativar contrato"
        >
          <Play />
          Reativar
        </ConfirmAction>
      )}
      <ConfirmAction
        action={cancelContract.bind(null, contract.id)}
        title="Cancelar o contrato?"
        description={`${omsText} ${
          activeItems === 1
            ? "O equipamento sai do contrato e fica livre para outro. "
            : activeItems > 1
              ? `Os ${activeItems} equipamentos saem do contrato e ficam livres para outro. `
              : ""
        }Mensalidades já geradas continuam em contas a receber. Esta ação não pode ser desfeita.`}
        confirmLabel="Cancelar contrato"
        destructive
        variant="ghost"
        className="text-steel hover:bg-gauge-red/10 hover:text-gauge-red"
      >
        <Ban />
        Cancelar contrato
      </ConfirmAction>
    </>
  );
}
