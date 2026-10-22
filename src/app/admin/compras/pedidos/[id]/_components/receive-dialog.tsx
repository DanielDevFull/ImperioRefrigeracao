"use client";

import { useActionState, useState } from "react";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, nativeSelectClass, useActionToast, ActionForm, FormSubmit } from "@/components/system/form";
import { initialActionState } from "@/lib/action";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DialogActions, FormDialog } from "../../../../estoque/_components/form-dialog";
import { formatQty, parseDecimal, round3 } from "../../../../estoque/_lib/stock-format";
import type { PickerLocation } from "../../../../estoque/_lib/types";
import { receiveOrder } from "../actions";
import type { ItemRow } from "./order-items";

/** "Receber mercadoria": quantidade recebida por item (parcial permitido). */
export function ReceiveDialog({
  orderId,
  items,
  locations,
  defaultLocationId,
  needsPayable,
  payableAmount,
  defaultDueDate,
}: {
  orderId: string;
  items: ItemRow[];
  locations: PickerLocation[];
  defaultLocationId: string;
  needsPayable: boolean;
  payableAmount: number;
  defaultDueDate: string;
}) {
  return (
    <FormDialog
      title="Receber mercadoria"
      description="Confira o que chegou. Cada quantidade dá entrada no estoque com o custo do pedido; o que faltar fica pendente."
      className="sm:max-w-2xl"
      trigger={
        <Button>
          <PackageCheck />
          Receber mercadoria
        </Button>
      }
    >
      {(close) => (
        <ReceiveForm
          orderId={orderId}
          items={items}
          locations={locations}
          defaultLocationId={defaultLocationId}
          needsPayable={needsPayable}
          payableAmount={payableAmount}
          defaultDueDate={defaultDueDate}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}

function ReceiveForm({
  orderId,
  items,
  locations,
  defaultLocationId,
  needsPayable,
  payableAmount,
  defaultDueDate,
  onDone,
}: {
  orderId: string;
  items: ItemRow[];
  locations: PickerLocation[];
  defaultLocationId: string;
  needsPayable: boolean;
  payableAmount: number;
  defaultDueDate: string;
  onDone: () => void;
}) {
  const [state, action, submitting] = useActionState(receiveOrder, initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const open = items.filter((i) => i.receivedQuantity < i.quantity);
  const remainingOf = (i: ItemRow) => round3(i.quantity - i.receivedQuantity);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(open.map((i) => [i.id, String(remainingOf(i)).replace(".", ",")])),
  );
  const [updateCost, setUpdateCost] = useState(true);
  const e = state.fieldErrors ?? {};
  const fillAll = () => setValues(Object.fromEntries(open.map((i) => [i.id, String(remainingOf(i)).replace(".", ",")])));
  const clearAll = () => setValues(Object.fromEntries(open.map((i) => [i.id, ""])));
  const willComplete = open.every((i) => (parseDecimal(values[i.id]) ?? 0) >= remainingOf(i));

  return (
    <ActionForm action={action} pending={submitting} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-silver">
          {open.length} {open.length === 1 ? "item pendente" : "itens pendentes"}
        </p>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={fillAll}>
            Receber tudo
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
            Zerar
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-rime rounded-lg border border-rime bg-muted/40">
        {open.map((i) => {
          const q = parseDecimal(values[i.id]);
          const over = q != null && q > remainingOf(i);
          const err = e[`recv_${i.id}`];
          return (
            <li key={i.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm text-silver">{i.name}</p>
                <p className="text-xs text-steel tabular-nums">
                  Pedido {formatQty(i.quantity, i.unit)}
                  {i.receivedQuantity > 0 && <>, já recebido {formatQty(i.receivedQuantity, i.unit)}</>}
                  , faltam {formatQty(remainingOf(i), i.unit)}
                </p>
                {(err || over) && (
                  <p className="mt-0.5 text-xs text-gauge-red">{err ?? `No máximo ${formatQty(remainingOf(i), i.unit)}.`}</p>
                )}
              </div>
              <div className="relative">
                <Input
                  name={`recv_${i.id}`}
                  inputMode="decimal"
                  value={values[i.id] ?? ""}
                  onChange={(ev) => setValues((v) => ({ ...v, [i.id]: ev.target.value.replace(/[^\d.,]/g, "") }))}
                  className={cn("h-9 pr-10 text-right tabular-nums", (over || err) && "border-gauge-red")}
                  aria-label={`Quantidade recebida de ${i.name}`}
                  placeholder="0"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-steel">{i.unit}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <Field label="Dar entrada em" required error={e.locationId} htmlFor="rc-loc">
        <select id="rc-loc" name="locationId" defaultValue={defaultLocationId} className={nativeSelectClass}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>

      {needsPayable && (
        <fieldset className="rounded-xl border border-rime bg-muted/40 p-4">
          <legend className="px-1 text-sm font-medium text-silver">Conta a pagar</legend>
          <p className="mb-3 text-xs text-steel">
            Lançada agora em Contas a pagar no valor do pedido com frete, <span className="text-silver tabular-nums">{formatBRL(payableAmount)}</span>.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vencimento" required error={e.dueDate} htmlFor="rc-due">
              <Input id="rc-due" name="dueDate" type="date" defaultValue={defaultDueDate} className="h-9" />
            </Field>
            <Field label="Nota fiscal" error={e.documentNumber} htmlFor="rc-doc">
              <Input id="rc-doc" name="documentNumber" className="h-9" placeholder="Ex.: NF 004512" />
            </Field>
          </div>
        </fieldset>
      )}

      <label className="flex items-start gap-3 rounded-lg border border-rime bg-muted/40 p-3">
        <Checkbox name="updateCost" checked={updateCost} onCheckedChange={(v) => setUpdateCost(v === true)} className="mt-0.5" />
        <span className="text-sm text-silver">
          Atualizar o custo dos produtos pelo custo médio
          <span className="mt-0.5 block text-xs text-steel">Combina o saldo atual com o custo deste pedido.</span>
        </span>
      </label>

      <DialogActions>
        <FormSubmit>{willComplete ? "Receber e concluir pedido" : "Registrar recebimento parcial"}</FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}
