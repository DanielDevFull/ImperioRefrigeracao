"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, useActionToast, ActionForm, FormSubmit } from "@/components/system/form";
import { initialActionState } from "@/lib/action";
import { DialogActions, FormDialog } from "../../estoque/_components/form-dialog";
import { ProductPicker, type PickerOption } from "../../estoque/_components/product-picker";
import { createRequest } from "../actions";

/** "Nova solicitação" manual de compra. */
export function NewRequestDialog({
  products,
  productId,
  quantity,
  label = "Nova solicitação",
  variant = "outline",
  size = "default",
}: {
  products: PickerOption[];
  productId?: string;
  quantity?: number;
  label?: string;
  variant?: "outline" | "default" | "ghost";
  size?: "default" | "sm";
}) {
  return (
    <FormDialog
      title="Nova solicitação de compra"
      description="Registre uma necessidade de compra. Depois, junte as solicitações em um pedido para o fornecedor."
      trigger={
        <Button variant={variant} size={size}>
          {size === "default" && <Plus />}
          {label}
        </Button>
      }
    >
      {(close) => <RequestForm products={products} productId={productId} quantity={quantity} onDone={close} />}
    </FormDialog>
  );
}

function RequestForm({
  products,
  productId: presetId,
  quantity,
  onDone,
}: {
  products: PickerOption[];
  productId?: string;
  quantity?: number;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createRequest, initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const [productId, setProductId] = useState(presetId ?? "");
  const product = products.find((p) => p.id === productId);
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <Field label="Produto" required error={e.productId} htmlFor="rq-product">
        <ProductPicker id="rq-product" products={products} value={productId} onChange={setProductId} invalid={Boolean(e.productId)} />
      </Field>
      <Field label="Quantidade" required error={e.quantity} htmlFor="rq-qty">
        <div className="relative">
          <Input
            id="rq-qty"
            name="quantity"
            inputMode="decimal"
            defaultValue={quantity ? String(quantity).replace(".", ",") : ""}
            className="h-9 pr-12 tabular-nums"
            aria-invalid={Boolean(e.quantity) || undefined}
            placeholder="0"
          />
          {product && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-steel">{product.unit}</span>
          )}
        </div>
      </Field>
      <Field label="Observação" htmlFor="rq-notes" hint="Ex.: instalação do cliente Padaria Trigo de Ouro na semana que vem.">
        <Input id="rq-notes" name="notes" className="h-9" />
      </Field>
      <DialogActions>
        <FormSubmit>Criar solicitação</FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}
