"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, nativeSelectClass, useActionToast, ActionForm, FormSubmit } from "@/components/system/form";
import { initialActionState } from "@/lib/action";
import { DialogActions, FormDialog } from "../../estoque/_components/form-dialog";
import { createOrder } from "../actions";
import { DateField, SelectField } from "@/components/system/fields";

/** "Novo pedido" manual: cria o rascunho e abre a página do pedido para incluir os itens. */
export function NewOrderDialog({
  suppliers,
  supplierId,
  variant = "default",
}: {
  suppliers: { id: string; name: string; active: boolean }[];
  supplierId?: string;
  variant?: "default" | "outline";
}) {
  return (
    <FormDialog
      title="Novo pedido de compra"
      description="O pedido começa como rascunho. Na próxima tela você inclui os itens e envia ao fornecedor."
      trigger={
        <Button variant={variant}>
          <Plus />
          Novo pedido
        </Button>
      }
    >
      {() => <OrderForm suppliers={suppliers} supplierId={supplierId} />}
    </FormDialog>
  );
}

function OrderForm({ suppliers, supplierId }: { suppliers: { id: string; name: string; active: boolean }[]; supplierId?: string }) {
  const [state, action, pending] = useActionState(createOrder, initialActionState);
  useActionToast(state);
  const e = state.fieldErrors ?? {};
  const active = suppliers.filter((s) => s.active);
  if (!active.length)
    return (
      <p className="text-sm text-steel">
        Cadastre um fornecedor ativo antes de criar pedidos.{" "}
        <Link href="/admin/fornecedores" className="text-ice hover:underline">
          Ir para fornecedores
        </Link>
      </p>
    );
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <Field label="Fornecedor" required error={e.supplierId} htmlFor="po-supplier">
        <SelectField id="po-supplier" name="supplierId" defaultValue={supplierId ?? ""} className={nativeSelectClass}>
          <option value="" disabled>
            Escolha o fornecedor
          </option>
          {active.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      </Field>
      <Field label="Previsão de entrega" error={e.expectedDate} htmlFor="po-expected">
        <DateField id="po-expected" name="expectedDate" className="h-9" />
      </Field>
      <Field label="Observações" htmlFor="po-notes">
        <Textarea id="po-notes" name="notes" rows={2} placeholder="Condição de pagamento, forma de entrega…" />
      </Field>
      <DialogActions>
        <FormSubmit>Criar pedido</FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}
