"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, SubmitButton, useActionToast } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { initialActionState } from "@/lib/action";
import { DialogActions, FormDialog } from "../../estoque/_components/form-dialog";
import { saveSupplier } from "../actions";

export type SupplierValues = {
  id: string;
  name: string;
  document: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
};

export function SupplierDialog({ supplier, variant }: { supplier?: SupplierValues; variant?: "default" | "outline" }) {
  return (
    <FormDialog
      title={supplier ? "Editar fornecedor" : "Novo fornecedor"}
      description={supplier ? undefined : "Distribuidoras de gás, peças e materiais. O telefone recebe os pedidos pelo WhatsApp."}
      className="sm:max-w-xl"
      trigger={
        supplier ? (
          <Button variant={variant ?? "outline"}>
            <Pencil />
            Editar fornecedor
          </Button>
        ) : (
          <Button variant={variant ?? "default"}>
            <Plus />
            Novo fornecedor
          </Button>
        )
      }
    >
      {(close) => <SupplierForm supplier={supplier} onDone={close} />}
    </FormDialog>
  );
}

function SupplierForm({ supplier, onDone }: { supplier?: SupplierValues; onDone: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState(saveSupplier, initialActionState);
  const [active, setActive] = useState(supplier?.active ?? true);
  useActionToast(state, {
    onSuccess: () => {
      onDone();
      if (!supplier && state.id) router.push(`/admin/fornecedores/${state.id}`);
    },
  });
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      <Field label="Nome" required error={e.name} htmlFor="sp-name">
        <Input id="sp-name" name="name" defaultValue={supplier?.name} className="h-9" autoFocus={!supplier} placeholder="Ex.: Frigelar Distribuidora" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CNPJ ou CPF" error={e.document} htmlFor="sp-doc">
          <MaskedInput id="sp-doc" name="document" mask="cpfcnpj" defaultValue={supplier?.document ?? undefined} className="h-9 tabular-nums" />
        </Field>
        <Field label="Contato" error={e.contactName} htmlFor="sp-contact">
          <Input id="sp-contact" name="contactName" defaultValue={supplier?.contactName ?? ""} className="h-9" placeholder="Nome do vendedor" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Telefone / WhatsApp" error={e.phone} htmlFor="sp-phone">
          <MaskedInput id="sp-phone" name="phone" mask="phone" defaultValue={supplier?.phone ?? undefined} className="h-9 tabular-nums" />
        </Field>
        <Field label="E-mail" error={e.email} htmlFor="sp-email">
          <Input id="sp-email" name="email" type="email" defaultValue={supplier?.email ?? ""} className="h-9" placeholder="pedidos@fornecedor.com.br" />
        </Field>
      </div>
      <Field label="Observações" htmlFor="sp-notes">
        <Textarea id="sp-notes" name="notes" rows={3} defaultValue={supplier?.notes ?? ""} placeholder="Prazo de entrega, condição de pagamento, pedido mínimo…" />
      </Field>
      {supplier && (
        <label className="flex items-center justify-between gap-4 rounded-lg border border-rime bg-night/40 px-3 py-2.5">
          <span>
            <span className="block text-sm text-silver">Fornecedor ativo</span>
            <span className="block text-xs text-steel">Inativos não aparecem para novos pedidos.</span>
          </span>
          <Switch checked={active} onCheckedChange={setActive} />
          <input type="hidden" name="active" value={active ? "on" : ""} />
        </label>
      )}
      <DialogActions>
        <SubmitButton>{supplier ? "Salvar fornecedor" : "Cadastrar fornecedor"}</SubmitButton>
      </DialogActions>
    </form>
  );
}
