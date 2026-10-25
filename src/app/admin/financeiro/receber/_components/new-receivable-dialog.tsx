"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Field, nativeSelectClass, useActionToast } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { addDays } from "@/lib/dates";
import { OptionPicker } from "../../_components/option-picker";
import type { CategoryOption } from "../../_lib/constants";
import { createReceivable } from "../actions";
import { ActionForm, FormSubmit } from "../../_components/action-form";
import { DateField, SelectField } from "@/components/system/fields";

export function NewReceivableDialog({
  customers,
  categories,
  today,
}: {
  customers: { id: string; name: string; tradeName: string | null }[];
  categories: CategoryOption[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Nova conta a receber
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {open && <NewReceivableForm customers={customers} categories={categories} today={today} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewReceivableForm({
  customers,
  categories,
  today,
  onDone,
}: {
  customers: { id: string; name: string; tradeName: string | null }[];
  categories: CategoryOption[];
  today: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createReceivable, initialActionState);
  useActionToast(state, { success: "Conta a receber criada", onSuccess: onDone });
  const e = state.fieldErrors ?? {};
  const defaultCategory = categories.find((c) => /servi/i.test(c.name))?.id ?? categories[0]?.id ?? "";

  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-silver">Nova conta a receber</DialogTitle>
        <DialogDescription>
          Para cobranças fora das mensalidades: um serviço avulso, uma venda ou um reembolso. O cliente vê a conta no portal com o Pix.
        </DialogDescription>
      </DialogHeader>

      <Field label="Cliente" htmlFor="customerId" error={e.customerId} hint="Opcional. Sem cliente, a conta não aparece no portal.">
        <OptionPicker
          id="customerId"
          name="customerId"
          placeholder="Escolha um cliente"
          searchPlaceholder="Buscar cliente…"
          emptyText="Nenhum cliente com esse nome."
          options={customers.map((c) => ({ value: c.id, label: c.name, hint: c.tradeName }))}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoria" htmlFor="categoryId" error={e.categoryId} required>
          <SelectField id="categoryId" name="categoryId" defaultValue={defaultCategory} className={nativeSelectClass} required>
            {categories.length === 0 && <option value="">Crie uma categoria de receita</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Tipo" htmlFor="kind" error={e.kind} required>
          <SelectField id="kind" name="kind" defaultValue="servico" className={nativeSelectClass}>
            <option value="servico">Serviço avulso</option>
            <option value="outro">Outra receita</option>
          </SelectField>
        </Field>
      </div>

      <Field label="Descrição" htmlFor="description" error={e.description} required>
        <Input id="description" name="description" placeholder="Ex.: Troca de capacitor — split da recepção" maxLength={160} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vencimento" htmlFor="dueDate" error={e.dueDate} required>
          <DateField id="dueDate" name="dueDate" defaultValue={addDays(today, 5)} required />
        </Field>
        <Field label="Valor" htmlFor="amount" error={e.amount} required>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-steel">R$</span>
            <MaskedInput id="amount" name="amount" mask="money" placeholder="0,00" className="pl-9 tabular-nums" required />
          </div>
        </Field>
      </div>

      <Field label="Observações" htmlFor="notes" error={e.notes}>
        <Textarea id="notes" name="notes" rows={2} placeholder="Ex.: combinado com o cliente por telefone." />
      </Field>

      {state.error && !state.fieldErrors && <p className="text-sm text-gauge-red">{state.error}</p>}

      <DialogFooter className="-mx-4 -mb-4 border-rime bg-muted/50">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Voltar
          </Button>
        </DialogClose>
        <FormSubmit>Criar conta a receber</FormSubmit>
      </DialogFooter>
    </ActionForm>
  );
}
