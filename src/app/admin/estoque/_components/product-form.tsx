"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, nativeSelectClass, useActionToast, ActionForm, FormSubmit } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { initialActionState } from "@/lib/action";
import { formatPercent } from "@/lib/format";
import { saveProduct } from "../actions";
import { categoryOptions, unitOptions } from "../_lib/stock-format";
import type { PickerLocation } from "../_lib/types";

export type ProductFormValues = {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
  costPrice: number;
  salePrice: number;
  minStock: number;
  reorderQty: number;
  preferredSupplierId: string | null;
  barcode: string | null;
  notes: string | null;
  active: boolean;
};

const qtyText = (n: number | null | undefined) => (n ? String(n).replace(".", ",") : "");
const centsOf = (v: string) => Number(v.replace(/\D/g, "") || 0) / 100;

export function ProductForm({
  product,
  suppliers,
  locations,
  onDone,
  cancelHref,
}: {
  product?: ProductFormValues;
  suppliers: { id: string; name: string; active: boolean }[];
  /** Só no cadastro: locais para o saldo inicial */
  locations?: PickerLocation[];
  onDone?: () => void;
  cancelHref?: string;
}) {
  const [state, action, pending] = useActionState(saveProduct, initialActionState);
  useActionToast(state, { success: "Produto salvo", onSuccess: onDone });
  const e = state.fieldErrors ?? {};
  const [active, setActive] = useState(product?.active ?? true);
  const [cost, setCost] = useState(product?.costPrice ?? 0);
  const [sale, setSale] = useState(product?.salePrice ?? 0);
  const margin = cost > 0 && sale > 0 ? (sale - cost) / cost : null;
  const isNew = !product;

  return (
    <ActionForm action={action} pending={pending} className="space-y-6">
      {product && <input type="hidden" name="id" value={product.id} />}

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field label="Nome" required error={e.name} htmlFor="pf-name">
          <Input id="pf-name" name="name" defaultValue={product?.name} className="h-9" autoFocus={isNew} placeholder="Ex.: Capacitor 35+5 µF 440 V" />
        </Field>
        <Field label="SKU" error={e.sku} htmlFor="pf-sku" hint="Código interno, único.">
          <Input id="pf-sku" name="sku" defaultValue={product?.sku ?? ""} className="h-9 uppercase" placeholder="CAP-35" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Categoria" required error={e.category} htmlFor="pf-cat">
          <select id="pf-cat" name="category" defaultValue={product?.category ?? "peca"} className={nativeSelectClass}>
            {categoryOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unidade" required error={e.unit} htmlFor="pf-unit">
          <select id="pf-unit" name="unit" defaultValue={product?.unit ?? "un"} className={nativeSelectClass}>
            {unitOptions.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Código de barras" error={e.barcode} htmlFor="pf-barcode">
          <Input id="pf-barcode" name="barcode" defaultValue={product?.barcode ?? ""} className="h-9" inputMode="numeric" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Custo" required error={e.costPrice} htmlFor="pf-cost" hint="Custo de compra por unidade.">
          <MaskedInput
            id="pf-cost"
            name="costPrice"
            mask="money"
            defaultValue={product?.costPrice ?? 0}
            onInput={(ev) => setCost(centsOf((ev.target as HTMLInputElement).value))}
            className="h-9 tabular-nums"
          />
        </Field>
        <Field
          label="Preço de venda"
          error={e.salePrice}
          htmlFor="pf-sale"
          hint={margin != null ? `Margem de ${formatPercent(margin)} sobre o custo.` : "Valor cobrado do cliente quando usado em OM. Deixe zerado se não é cobrado."}
        >
          <MaskedInput
            id="pf-sale"
            name="salePrice"
            mask="money"
            defaultValue={product?.salePrice ?? 0}
            onInput={(ev) => setSale(centsOf((ev.target as HTMLInputElement).value))}
            className="h-9 tabular-nums"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Estoque mínimo" error={e.minStock} htmlFor="pf-min" hint="Abaixo disso, o sistema pede compra.">
          <Input id="pf-min" name="minStock" inputMode="decimal" defaultValue={qtyText(product?.minStock)} className="h-9 tabular-nums" placeholder="0" />
        </Field>
        <Field label="Quantidade de reposição" error={e.reorderQty} htmlFor="pf-reorder" hint="Sugerida em cada solicitação.">
          <Input id="pf-reorder" name="reorderQty" inputMode="decimal" defaultValue={qtyText(product?.reorderQty)} className="h-9 tabular-nums" placeholder="0" />
        </Field>
        <Field label="Fornecedor preferido" error={e.preferredSupplierId} htmlFor="pf-supplier">
          <select id="pf-supplier" name="preferredSupplierId" defaultValue={product?.preferredSupplierId ?? ""} className={nativeSelectClass}>
            <option value="">Sem preferência</option>
            {suppliers
              .filter((s) => s.active || s.id === product?.preferredSupplierId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
      </div>

      {isNew && locations && locations.length > 0 && (
        <fieldset className="rounded-xl border border-rime bg-night/40 p-4">
          <legend className="px-1 text-sm font-medium text-silver">Saldo inicial</legend>
          <p className="mb-3 text-xs text-steel">Opcional. Registra uma entrada com o custo informado acima.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantidade" error={e.initialQty} htmlFor="pf-iq">
              <Input id="pf-iq" name="initialQty" inputMode="decimal" className="h-9 tabular-nums" placeholder="0" />
            </Field>
            <Field label="Local" htmlFor="pf-il">
              <select id="pf-il" name="initialLocationId" className={nativeSelectClass} defaultValue={locations.find((l) => l.type === "almoxarifado")?.id}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </fieldset>
      )}

      <Field label="Observações" error={e.notes} htmlFor="pf-notes">
        <Textarea id="pf-notes" name="notes" defaultValue={product?.notes ?? ""} rows={3} placeholder="Compatibilidade, marca preferida, onde fica guardado…" />
      </Field>

      {product && (
        <label className="flex items-center justify-between gap-4 rounded-lg border border-rime bg-night/40 px-3 py-2.5">
          <span>
            <span className="block text-sm text-silver">Produto ativo</span>
            <span className="block text-xs text-steel">Inativos somem das listas de seleção e não geram reposição.</span>
          </span>
          <Switch checked={active} onCheckedChange={setActive} />
          <input type="hidden" name="active" value={active ? "on" : ""} />
        </label>
      )}

      {state.error && !Object.keys(e).length && <p className="text-sm text-gauge-red">{state.error}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {cancelHref && (
          <Button variant="ghost" asChild>
            <Link href={cancelHref}>Cancelar</Link>
          </Button>
        )}
        <FormSubmit className="h-9 px-4">{isNew ? "Cadastrar produto" : "Salvar produto"}</FormSubmit>
      </div>
    </ActionForm>
  );
}
