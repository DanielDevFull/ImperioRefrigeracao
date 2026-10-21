"use client";

import { useActionState, useState } from "react";
import { ArrowLeftRight, ClipboardCheck, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, nativeSelectClass, useActionToast, ActionForm, FormSubmit } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { initialActionState } from "@/lib/action";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { registerAdjustment, registerEntry, registerTransfer } from "../actions";
import { formatQty, parseDecimal, round3, weightedAverageCost } from "../_lib/stock-format";
import type { MovementData, PickerLocation } from "../_lib/types";
import { DialogActions, FormDialog } from "./form-dialog";
import { ProductPicker } from "./product-picker";

type Kind = "entrada" | "ajuste" | "transferencia";

/** Botões "Registrar entrada", "Transferir" e "Ajuste de inventário" com seus diálogos. */
export function StockActions({
  data,
  productId,
  size = "default",
  only,
}: {
  data: MovementData;
  /** Pré-seleciona (e fixa) o produto */
  productId?: string;
  size?: "default" | "sm";
  only?: Kind[];
}) {
  const show = (k: Kind) => !only || only.includes(k);
  return (
    <>
      {show("entrada") && (
        <FormDialog
          title="Registrar entrada"
          description="Compra avulsa, devolução de técnico ou saldo encontrado. A entrada soma no local escolhido."
          trigger={
            <Button size={size} variant="outline">
              <PackagePlus />
              Registrar entrada
            </Button>
          }
        >
          {(close) => <EntryForm data={data} fixedProductId={productId} onDone={close} />}
        </FormDialog>
      )}
      {show("transferencia") && (
        <FormDialog
          title="Transferir entre locais"
          description="Use para abastecer o veículo de um técnico a partir do almoxarifado, ou para devolver sobras."
          trigger={
            <Button size={size} variant="outline">
              <ArrowLeftRight />
              Transferir
            </Button>
          }
        >
          {(close) => <TransferForm data={data} fixedProductId={productId} onDone={close} />}
        </FormDialog>
      )}
      {show("ajuste") && (
        <FormDialog
          title="Ajuste de inventário"
          description="Corrija o saldo depois de uma contagem ou registre uma saída avulsa (perda, uso interno, devolução)."
          trigger={
            <Button size={size} variant="outline">
              <ClipboardCheck />
              Ajuste de inventário
            </Button>
          }
        >
          {(close) => <AdjustForm data={data} fixedProductId={productId} onDone={close} />}
        </FormDialog>
      )}
    </>
  );
}

function useProduct(data: MovementData, fixedProductId?: string) {
  const [productId, setProductId] = useState(fixedProductId ?? "");
  const product = data.products.find((p) => p.id === productId);
  const levelsOf = (locationId: string) => (productId ? (data.levels[productId]?.[locationId] ?? 0) : 0);
  const total = productId ? Object.values(data.levels[productId] ?? {}).reduce((a, b) => a + b, 0) : 0;
  return { productId, setProductId, product, levelsOf, total };
}

const defaultWarehouse = (locs: PickerLocation[]) => locs.find((l) => l.type === "almoxarifado")?.id ?? locs[0]?.id ?? "";

function locationLabel(l: PickerLocation) {
  return l.technicianName && !l.name.includes(l.technicianName.split(" ")[0]) ? `${l.name} (${l.technicianName})` : l.name;
}

function ProductField({
  data,
  fixedProductId,
  value,
  onChange,
  error,
}: {
  data: MovementData;
  fixedProductId?: string;
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  if (fixedProductId) {
    const p = data.products.find((x) => x.id === fixedProductId);
    return (
      <div className="rounded-lg border border-rime bg-night/50 px-3 py-2">
        <input type="hidden" name="productId" value={fixedProductId} />
        <p className="text-xs text-steel">Produto</p>
        <p className="truncate text-sm text-silver">{p?.name ?? "—"}</p>
      </div>
    );
  }
  return (
    <Field label="Produto" required error={error} htmlFor="mv-product">
      <ProductPicker
        id="mv-product"
        products={data.products}
        value={value}
        onChange={onChange}
        invalid={Boolean(error)}
      />
    </Field>
  );
}

function QtyInput({ name, unit, value, onChange, invalid, id }: { name: string; unit?: string; value: string; onChange: (v: string) => void; invalid?: boolean; id: string }) {
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        aria-invalid={invalid || undefined}
        className="h-9 pr-12 tabular-nums"
        placeholder="0"
      />
      {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-steel">{unit}</span>}
    </div>
  );
}

function EntryForm({ data, fixedProductId, onDone }: { data: MovementData; fixedProductId?: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(registerEntry, initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const { productId, setProductId, product, total } = useProduct(data, fixedProductId);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState<number | null>(null);
  const [updateCost, setUpdateCost] = useState(true);
  const e = state.fieldErrors ?? {};
  const q = parseDecimal(qty) ?? 0;
  const c = cost ?? product?.costPrice ?? 0;
  const newCost = product ? weightedAverageCost(total, product.costPrice, q, c) : 0;
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <ProductField
        data={data}
        fixedProductId={fixedProductId}
        value={productId}
        onChange={(id) => {
          setProductId(id);
          setCost(null);
        }}
        error={e.productId}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Local" required error={e.locationId} htmlFor="en-loc">
          <select id="en-loc" name="locationId" defaultValue={defaultWarehouse(data.locations)} className={nativeSelectClass}>
            {data.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {locationLabel(l)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantidade" required error={e.quantity} htmlFor="en-qty">
          <QtyInput id="en-qty" name="quantity" unit={product?.unit} value={qty} onChange={setQty} invalid={Boolean(e.quantity)} />
        </Field>
      </div>
      <Field label="Custo unitário" required error={e.unitCost} htmlFor="en-cost" hint="Valor pago por unidade nesta entrada.">
        <MaskedInput
          key={productId}
          id="en-cost"
          name="unitCost"
          mask="money"
          defaultValue={product?.costPrice ?? 0}
          // a máscara de dinheiro usa só os dígitos (centavos), então dá para calcular o valor aqui
          onInput={(ev) => setCost(Number((ev.target as HTMLInputElement).value.replace(/\D/g, "") || 0) / 100)}
          className="h-9 tabular-nums"
        />
      </Field>
      <Field label="Observação" htmlFor="en-notes" hint="Ex.: NF 4521, devolução do veículo do Rafael.">
        <Input id="en-notes" name="notes" className="h-9" />
      </Field>
      <label className="flex items-start gap-3 rounded-lg border border-rime bg-night/40 p-3">
        <Checkbox
          name="updateCost"
          checked={updateCost}
          onCheckedChange={(v) => setUpdateCost(v === true)}
          className="mt-0.5"
        />
        <span className="text-sm">
          <span className="text-silver">Atualizar o custo do produto pelo custo médio</span>
          {product && q > 0 && (
            <span className="mt-0.5 block text-xs text-steel">
              {newCost === product.costPrice ? (
                <>O custo continua {formatBRL(product.costPrice)}.</>
              ) : (
                <>
                  De {formatBRL(product.costPrice)} para <span className="text-frost tabular-nums">{formatBRL(newCost)}</span>{" "}
                  (saldo atual {formatQty(total, product.unit)}).
                </>
              )}
            </span>
          )}
        </span>
      </label>
      <DialogActions>
        <FormSubmit>Registrar entrada</FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}

function AdjustForm({ data, fixedProductId, onDone }: { data: MovementData; fixedProductId?: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(registerAdjustment, initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const { productId, setProductId, product, levelsOf } = useProduct(data, fixedProductId);
  const [mode, setMode] = useState<"contagem" | "saida">("contagem");
  const [locationId, setLocationId] = useState(defaultWarehouse(data.locations));
  const [counted, setCounted] = useState("");
  const [qty, setQty] = useState("");
  const e = state.fieldErrors ?? {};
  const current = levelsOf(locationId);
  const countedN = parseDecimal(counted);
  const qtyN = parseDecimal(qty);
  const diff = countedN == null ? null : round3(countedN - current);
  const unit = product?.unit ?? "un";
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <ProductField data={data} fixedProductId={fixedProductId} value={productId} onChange={setProductId} error={e.productId} />
      <input type="hidden" name="mode" value={mode} />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-night/60 p-1 ring-1 ring-rime" role="radiogroup" aria-label="Tipo de ajuste">
        {(
          [
            ["contagem", "Ajuste de contagem"],
            ["saida", "Saída avulsa"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              mode === value ? "bg-ice/15 text-silver ring-1 ring-ice/30" : "text-steel hover:text-silver",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Local" required error={e.locationId} htmlFor="aj-loc">
          <select
            id="aj-loc"
            name="locationId"
            value={locationId}
            onChange={(ev) => setLocationId(ev.target.value)}
            className={nativeSelectClass}
          >
            {data.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {locationLabel(l)}
              </option>
            ))}
          </select>
        </Field>
        {mode === "contagem" ? (
          <Field label="Quantidade contada" required error={e.counted} htmlFor="aj-counted">
            <QtyInput id="aj-counted" name="counted" unit={product?.unit} value={counted} onChange={setCounted} invalid={Boolean(e.counted)} />
          </Field>
        ) : (
          <Field label="Quantidade que saiu" required error={e.quantity} htmlFor="aj-qty">
            <QtyInput id="aj-qty" name="quantity" unit={product?.unit} value={qty} onChange={setQty} invalid={Boolean(e.quantity)} />
          </Field>
        )}
      </div>
      {product && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-lg border border-rime bg-night/40 px-3 py-2.5 text-sm">
          <span className="text-steel">
            Saldo no sistema <span className="tabular-nums text-silver">{formatQty(current, unit)}</span>
          </span>
          {mode === "contagem" && diff != null && (
            <span className="text-steel">
              Diferença{" "}
              <span className={cn("tabular-nums", diff > 0 ? "text-mint" : diff < 0 ? "text-gauge-red" : "text-silver")}>
                {diff > 0 ? "+" : ""}
                {formatQty(diff, unit)}
              </span>
            </span>
          )}
          {mode === "saida" && qtyN != null && (
            <span className={cn("text-steel", qtyN > current && "text-gauge-red")}>
              {qtyN > current ? "Mais do que o saldo do local" : <>Fica <span className="tabular-nums text-silver">{formatQty(round3(current - qtyN), unit)}</span></>}
            </span>
          )}
        </div>
      )}
      <Field
        label="Motivo"
        required
        error={e.reason}
        htmlFor="aj-reason"
        hint={mode === "contagem" ? "Ex.: contagem mensal do almoxarifado." : "Ex.: cilindro com vazamento, uso na oficina, devolução ao fornecedor."}
      >
        <Input id="aj-reason" name="reason" className="h-9" aria-invalid={Boolean(e.reason) || undefined} />
      </Field>
      <DialogActions>
        <FormSubmit>{mode === "contagem" ? "Registrar ajuste" : "Registrar saída"}</FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}

function TransferForm({ data, fixedProductId, onDone }: { data: MovementData; fixedProductId?: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(registerTransfer, initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const { productId, setProductId, product, levelsOf } = useProduct(data, fixedProductId);
  const warehouse = defaultWarehouse(data.locations);
  const firstVehicle =
    data.locations.find((l) => l.type === "veiculo" && l.id !== warehouse)?.id ??
    data.locations.find((l) => l.id !== warehouse)?.id ??
    "";
  const [fromId, setFromId] = useState(warehouse);
  const [toId, setToId] = useState(firstVehicle);
  const [qty, setQty] = useState("");
  const e = state.fieldErrors ?? {};
  const available = levelsOf(fromId);
  const q = parseDecimal(qty);
  const unit = product?.unit ?? "un";
  const pickerProducts = data.products.map((p) => ({
    ...p,
    hint: formatQty(data.levels[p.id]?.[fromId] ?? 0, p.unit),
  }));
  if (data.locations.length < 2)
    return (
      <p className="text-sm text-steel">
        Cadastre pelo menos dois locais ativos (por exemplo, o almoxarifado e o veículo de um técnico) na aba Locais para transferir.
      </p>
    );
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <ProductField
        data={{ ...data, products: pickerProducts }}
        fixedProductId={fixedProductId}
        value={productId}
        onChange={setProductId}
        error={e.productId}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="De" required error={e.fromId} htmlFor="tr-from">
          <select id="tr-from" name="fromId" value={fromId} onChange={(ev) => setFromId(ev.target.value)} className={nativeSelectClass}>
            {data.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {locationLabel(l)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Para" required error={e.toId} htmlFor="tr-to">
          <select id="tr-to" name="toId" value={toId} onChange={(ev) => setToId(ev.target.value)} className={nativeSelectClass}>
            {data.locations.map((l) => (
              <option key={l.id} value={l.id} disabled={l.id === fromId}>
                {locationLabel(l)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Quantidade" required error={e.quantity} htmlFor="tr-qty">
        <QtyInput id="tr-qty" name="quantity" unit={product?.unit} value={qty} onChange={setQty} invalid={Boolean(e.quantity)} />
      </Field>
      {product && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-rime bg-night/40 px-3 py-2.5 text-sm">
          <div>
            <p className="text-xs text-steel">Na origem</p>
            <p className={cn("tabular-nums", q != null && q > available ? "text-gauge-red" : "text-silver")}>
              {formatQty(available, unit)}
              {q != null && q > 0 && q <= available && (
                <span className="text-steel"> fica {formatQty(round3(available - q), unit)}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-steel">No destino</p>
            <p className="tabular-nums text-silver">
              {formatQty(levelsOf(toId), unit)}
              {q != null && q > 0 && <span className="text-steel"> fica {formatQty(round3(levelsOf(toId) + q), unit)}</span>}
            </p>
          </div>
          {q != null && q > available && (
            <p className="col-span-2 text-xs text-gauge-red">A origem não tem saldo suficiente para essa quantidade.</p>
          )}
        </div>
      )}
      <Field label="Observação" htmlFor="tr-notes">
        <Input id="tr-notes" name="notes" className="h-9" placeholder="Ex.: kit da semana" />
      </Field>
      <DialogActions>
        <FormSubmit disabled={q != null && q > available}>Transferir</FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}
