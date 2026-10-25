"use client";

import { useActionState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, nativeSelectClass, useActionToast, ActionForm, FormSubmit } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { initialActionState } from "@/lib/action";
import { DialogActions, FormDialog } from "../../../../estoque/_components/form-dialog";
import type { PickerLocation } from "../../../../estoque/_lib/types";
import { updateOrderDetails } from "../actions";
import { DateField, SelectField } from "@/components/system/fields";

type Details = {
  id: string;
  status: string;
  supplierId: string | null;
  expectedDate: string | null;
  locationId: string | null;
  freight: number;
  notes: string | null;
};

export function OrderDetailsDialog({
  order,
  suppliers,
  locations,
}: {
  order: Details;
  suppliers: { id: string; name: string; active: boolean }[];
  locations: PickerLocation[];
}) {
  return (
    <FormDialog
      title="Dados do pedido"
      trigger={
        <Button size="sm" variant="ghost">
          <Pencil />
          Editar
        </Button>
      }
    >
      {(close) => <DetailsForm order={order} suppliers={suppliers} locations={locations} onDone={close} />}
    </FormDialog>
  );
}

function DetailsForm({
  order,
  suppliers,
  locations,
  onDone,
}: {
  order: Details;
  suppliers: { id: string; name: string; active: boolean }[];
  locations: PickerLocation[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateOrderDetails, initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const e = state.fieldErrors ?? {};
  const draft = order.status === "rascunho";
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <input type="hidden" name="id" value={order.id} />
      <Field
        label="Fornecedor"
        required
        error={e.supplierId}
        htmlFor="od-supplier"
        hint={draft ? undefined : "O fornecedor não muda depois que o pedido é enviado."}
      >
        <SelectField
          id="od-supplier"
          name="supplierId"
          defaultValue={order.supplierId ?? ""}
          disabled={!draft}
          className={nativeSelectClass}
        >
          <option value="" disabled>
            Escolha o fornecedor
          </option>
          {suppliers
            .filter((s) => s.active || s.id === order.supplierId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </SelectField>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Previsão de entrega" error={e.expectedDate} htmlFor="od-expected">
          <DateField id="od-expected" name="expectedDate" defaultValue={order.expectedDate ?? ""} className="h-9" />
        </Field>
        <Field label="Frete" error={e.freight} htmlFor="od-freight">
          <MaskedInput id="od-freight" name="freight" mask="money" defaultValue={order.freight} className="h-9 tabular-nums" />
        </Field>
      </div>
      <Field label="Local de recebimento" required error={e.locationId} htmlFor="od-loc">
        <SelectField id="od-loc" name="locationId" defaultValue={order.locationId ?? locations[0]?.id} className={nativeSelectClass}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectField>
      </Field>
      <Field label="Observações" htmlFor="od-notes">
        <Textarea id="od-notes" name="notes" rows={3} defaultValue={order.notes ?? ""} />
      </Field>
      <DialogActions>
        <FormSubmit>Salvar pedido</FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}
