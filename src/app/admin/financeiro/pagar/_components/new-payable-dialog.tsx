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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { addMonths } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { MAX_UPLOAD_LABEL } from "@/lib/upload";
import { fitImage, isImageFile, setInputFiles, UPLOAD_BUDGET_BYTES } from "@/lib/upload-client";
import { OptionPicker } from "../../_components/option-picker";
import type { CategoryOption } from "../../_lib/constants";
import { createPayable } from "../actions";
import { ActionForm, FormSubmit } from "../../_components/action-form";
import { DateField, SelectField } from "@/components/system/fields";

export function NewPayableDialog({
  suppliers,
  categories,
  today,
}: {
  suppliers: { id: string; name: string }[];
  categories: CategoryOption[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Nova conta a pagar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {open && <NewPayableForm suppliers={suppliers} categories={categories} today={today} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewPayableForm({
  suppliers,
  categories,
  today,
  onDone,
}: {
  suppliers: { id: string; name: string }[];
  categories: CategoryOption[];
  today: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createPayable, initialActionState);
  useActionToast(state, { success: "Conta a pagar criada", onSuccess: onDone });
  const [repeat, setRepeat] = useState(false);
  const [months, setMonths] = useState("12");
  const [dueDate, setDueDate] = useState(today);
  const [preparing, setPreparing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const e = state.fieldErrors ?? {};
  const n = Math.min(36, Math.max(2, Number(months) || 2));
  const validDue = /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
  const lastDue = validDue ? addMonths(dueDate, n - 1, Number(dueDate.slice(8, 10))) : null;

  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      <input type="hidden" name="repeat" value={repeat ? "on" : ""} />
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-silver">Nova conta a pagar</DialogTitle>
        <DialogDescription>Boletos, notas de fornecedor, aluguel, impostos e outras despesas.</DialogDescription>
      </DialogHeader>

      <Field label="Descrição" htmlFor="description" error={e.description} required>
        <Input id="description" name="description" placeholder="Ex.: Aluguel do galpão" maxLength={160} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoria" htmlFor="categoryId" error={e.categoryId} required>
          <SelectField id="categoryId" name="categoryId" defaultValue={categories[0]?.id ?? ""} className={nativeSelectClass} required>
            {categories.length === 0 && <option value="">Crie uma categoria de despesa</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Fornecedor" htmlFor="supplierId" error={e.supplierId} hint="Opcional.">
          <OptionPicker
            id="supplierId"
            name="supplierId"
            placeholder="Escolha um fornecedor"
            searchPlaceholder="Buscar fornecedor…"
            emptyText="Nenhum fornecedor com esse nome."
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Vencimento" htmlFor="dueDate" error={e.dueDate} required>
          <DateField id="dueDate" name="dueDate" value={dueDate} onChange={(ev) => setDueDate(ev.target.value)} required />
        </Field>
        <Field label="Valor" htmlFor="amount" error={e.amount} required>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-steel">R$</span>
            <MaskedInput id="amount" name="amount" mask="money" placeholder="0,00" className="pl-9 tabular-nums" required />
          </div>
        </Field>
        <Field label="Nº do documento" htmlFor="documentNumber" error={e.documentNumber}>
          <Input id="documentNumber" name="documentNumber" placeholder="NF, boleto…" maxLength={60} />
        </Field>
      </div>

      <div className="rounded-xl bg-muted/60 p-3 ring-1 ring-rime">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium text-silver">Repetir mensalmente</span>
            <span className="block text-xs text-steel">Cria uma conta por mês com o mesmo valor e dia de vencimento.</span>
          </span>
          <Switch checked={repeat} onCheckedChange={setRepeat} aria-label="Repetir mensalmente" />
        </label>
        {repeat && (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-rime pt-3">
            <Field label="Por quantos meses" htmlFor="repeatMonths" error={e.repeatMonths} className="w-36">
              <Input
                id="repeatMonths"
                name="repeatMonths"
                type="number"
                inputMode="numeric"
                min={2}
                max={36}
                value={months}
                onChange={(ev) => setMonths(ev.target.value)}
              />
            </Field>
            {lastDue && (
              <p className="pb-2 text-xs text-steel">
                {n} contas, de {formatDate(dueDate)} a {formatDate(lastDue)}.
              </p>
            )}
          </div>
        )}
      </div>

      <Field
        label="Anexo"
        htmlFor="attachment"
        error={fileError ?? e.attachment}
        hint={preparing ? "Reduzindo a imagem…" : `Boleto ou nota em PDF ou imagem, até ${MAX_UPLOAD_LABEL}.`}
      >
        <Input
          id="attachment"
          name="attachment"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          className="file:mr-3 file:text-silver"
          onChange={async (ev) => {
            const input = ev.currentTarget;
            const f = input.files?.[0];
            setFileError(null);
            if (!f) return;
            // imagem: reduz no navegador (lado maior 2400 px para o código de barras continuar legível)
            setPreparing(true);
            const ready = isImageFile(f) ? await fitImage(f, { maxSide: 2400, maxBytes: 2 * 1024 * 1024 }) : f;
            setPreparing(false);
            if (ready.size > UPLOAD_BUDGET_BYTES) {
              input.value = "";
              setFileError(
                isImageFile(f)
                  ? `A imagem passa de ${MAX_UPLOAD_LABEL} e não pôde ser reduzida. Envie em JPG, PNG ou PDF.`
                  : `O PDF passa de ${MAX_UPLOAD_LABEL}. Envie uma versão menor (ex.: o boleto baixado direto do banco).`,
              );
              return;
            }
            if (ready !== f) setInputFiles(input, [ready]);
          }}
        />
      </Field>

      <Field label="Observações" htmlFor="notes" error={e.notes}>
        <Textarea id="notes" name="notes" rows={2} placeholder="Ex.: pagar pelo app do banco, código de barras no anexo." />
      </Field>

      {state.error && !state.fieldErrors && <p className="text-sm text-gauge-red">{state.error}</p>}

      <DialogFooter className="-mx-4 -mb-4 border-rime bg-muted/50">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Voltar
          </Button>
        </DialogClose>
        <FormSubmit disabled={preparing}>{repeat ? `Criar ${n} contas a pagar` : "Criar conta a pagar"}</FormSubmit>
      </DialogFooter>
    </ActionForm>
  );
}
