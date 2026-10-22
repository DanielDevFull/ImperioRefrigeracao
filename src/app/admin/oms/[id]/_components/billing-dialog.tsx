"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { ActionForm, Field, FormSubmit, useActionToast } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { initialActionState } from "@/lib/action";
import { saveBillingAction } from "../../actions";

function BillingForm({ id, laborAmount, billable, onDone }: { id: string; laborAmount: number; billable: boolean; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveBillingAction.bind(null, id), initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const [bill, setBill] = useState(billable);
  return (
    <ActionForm action={action} pending={pending} className="grid grid-cols-1 gap-4">
      <Field label="Mão de obra (R$)" htmlFor="bill-labor" error={state.fieldErrors?.laborAmount}>
        <MaskedInput id="bill-labor" name="laborAmount" mask="money" className="h-9 text-right tabular-nums" defaultValue={laborAmount} />
      </Field>
      <div className="flex items-start justify-between gap-4 rounded-lg p-3 ring-1 ring-rime">
        <div>
          <label htmlFor="bill-billable" className="text-sm font-medium text-silver">
            Cobrar do cliente ao concluir
          </label>
          <p className="mt-0.5 text-xs text-steel">{bill ? "Gera conta a receber na conclusão." : "Coberto pelo contrato, sem cobrança avulsa."}</p>
        </div>
        <Switch id="bill-billable" name="billable" checked={bill} onCheckedChange={setBill} />
      </div>
      <DialogFooter className="-mx-4 -mb-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Voltar
        </Button>
        <FormSubmit>Salvar valores</FormSubmit>
      </DialogFooter>
    </ActionForm>
  );
}

export function BillingDialog({ id, laborAmount, billable }: { id: string; laborAmount: number; billable: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 text-steel hover:text-frost" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
        Ajustar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-sans text-base font-semibold">Valores da OM</DialogTitle>
            <DialogDescription>O total é recalculado na conclusão, somando os materiais cobrados.</DialogDescription>
          </DialogHeader>
          {open && <BillingForm id={id} laborAmount={laborAmount} billable={billable} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
