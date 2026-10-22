"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PackagePlus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { ActionForm, Field, FormSubmit, nativeSelectClass } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatBRL, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addMaterialAction, removeMaterialAction, type MaterialState } from "../../actions";

export type MaterialItem = {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  locationName: string | null;
  quantity: number;
  unitPrice: number;
  chargeCustomer: boolean;
};

export type MaterialOptions = {
  products: { id: string; name: string; sku: string | null; unit: string; salePrice: number; category: string }[];
  locations: { id: string; name: string; type: string; technicianId: string | null }[];
  balance: Record<string, Record<string, number>>;
};

function AddMaterialForm({
  id,
  options,
  defaultLocationId,
  chargeByDefault,
  onDone,
}: {
  id: string;
  options: MaterialOptions;
  defaultLocationId: string | null;
  chargeByDefault: boolean;
  onDone: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId ?? options.locations[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [charge, setCharge] = useState(chargeByDefault);
  const product = options.products.find((p) => p.id === productId);
  const location = options.locations.find((l) => l.id === locationId);
  const available = productId && locationId ? (options.balance[productId]?.[locationId] ?? 0) : null;
  const qtyNum = Number(qty.replace(",", "."));
  const short = available != null && Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum > available;

  const [state, action, pending] = useActionState(async (prev: MaterialState, fd: FormData) => {
    const r = await addMaterialAction(id, prev, fd);
    if (r.ok) {
      toast.success(r.message ?? "Material lançado");
      if (r.warning) toast.warning(r.warning, { duration: 9000 });
      setProductId("");
      setQty("");
    } else if (r.error) toast.error(r.error);
    return r;
  }, {} as MaterialState);
  const fe = state.fieldErrors ?? {};

  return (
    <ActionForm action={action} pending={pending} className="space-y-4 border-t border-rime bg-night/30 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Field label="Produto" htmlFor="mat-product" error={fe.productId} required>
          <select id="mat-product" name="productId" className={nativeSelectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Escolha o produto</option>
            {options.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.sku ? ` (${p.sku})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sai do estoque" htmlFor="mat-location" error={fe.locationId}>
          <select id="mat-location" name="locationId" className={nativeSelectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {options.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.id === defaultLocationId ? " (do técnico)" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[8rem_10rem_minmax(0,1fr)]">
        <Field label={`Quantidade${product ? ` (${product.unit})` : ""}`} htmlFor="mat-qty" error={fe.quantity} required>
          <Input
            id="mat-qty"
            name="quantity"
            inputMode="decimal"
            className="h-9 text-right tabular-nums"
            placeholder="0"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ""))}
          />
        </Field>
        <Field label="Preço unitário" htmlFor="mat-price" error={fe.unitPrice}>
          <MaskedInput
            key={productId}
            id="mat-price"
            name="unitPrice"
            mask="money"
            className="h-9 text-right tabular-nums"
            defaultValue={product?.salePrice ?? ""}
            placeholder="0,00"
          />
        </Field>
        <div className="col-span-2 flex items-center justify-between gap-3 rounded-lg px-3 py-2 ring-1 ring-rime sm:col-span-1 sm:self-end">
          <label htmlFor="mat-charge" className="text-sm text-silver">
            Cobrar do cliente
          </label>
          <Switch id="mat-charge" name="chargeCustomer" checked={charge} onCheckedChange={setCharge} />
        </div>
      </div>
      {available != null && (
        <p className={cn("flex items-start gap-2 text-xs", short || available < 0 ? "text-brass" : "text-steel")}>
          {(short || available < 0) && <TriangleAlert className="mt-px size-3.5 shrink-0" />}
          <span>
            Saldo em {location?.name}: <span className="readout">{formatNumber(available)}</span> {product?.unit}.
            {short && " O saldo vai ficar negativo; registre a entrada ou transfira do almoxarifado depois."}
          </span>
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Voltar
        </Button>
        <FormSubmit>Lançar material</FormSubmit>
      </div>
    </ActionForm>
  );
}

export function Materials({
  id,
  items,
  editable,
  options,
  defaultLocationId,
  chargeByDefault,
}: {
  id: string;
  items: MaterialItem[];
  editable: boolean;
  options: MaterialOptions;
  defaultLocationId: string | null;
  chargeByDefault: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const charged = items.filter((m) => m.chargeCustomer).reduce((s, m) => s + m.quantity * m.unitPrice, 0);

  return (
    <div>
      {items.length === 0 && !adding ? (
        editable ? (
          <EmptyState
            className="py-10"
            title="Nenhum material lançado"
            description="Lance gás, peças e consumíveis usados no atendimento. A baixa sai do estoque do veículo do técnico."
            action={
              <Button variant="outline" onClick={() => setAdding(true)}>
                <PackagePlus className="size-4" />
                Lançar material
              </Button>
            }
          />
        ) : (
          <p className="px-5 py-4 text-sm text-steel">Nenhum material foi lançado nesta OM.</p>
        )
      ) : (
        items.length > 0 && (
          <ul className="divide-y divide-rime/70">
            <AnimatePresence initial={false}>
              {items.map((m) => (
                <motion.li
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/estoque/${m.productId}`} className="block truncate text-sm text-silver hover:text-frost">
                      {m.productName}
                    </Link>
                    <p className="truncate text-xs text-steel">
                      {m.locationName ? `Saiu de ${m.locationName}` : "Sem local de estoque"}
                    </p>
                  </div>
                  <span className="readout w-20 shrink-0 text-right text-sm text-silver">
                    {formatNumber(m.quantity)} <span className="text-xs text-steel">{m.unit}</span>
                  </span>
                  <span className="hidden w-28 shrink-0 text-right sm:block">
                    {m.chargeCustomer ? (
                      <>
                        <span className="readout block text-sm text-silver">{formatBRL(m.quantity * m.unitPrice)}</span>
                        <span className="readout block text-xs text-steel">{formatBRL(m.unitPrice)} cada</span>
                      </>
                    ) : (
                      <span className="text-xs text-steel">Não cobrado</span>
                    )}
                  </span>
                  {editable && (
                    <ConfirmAction
                      action={removeMaterialAction.bind(null, m.id)}
                      title="Remover este material?"
                      description={`${formatNumber(m.quantity)} ${m.unit} de ${m.productName} voltam para ${m.locationName ?? "o estoque"}.`}
                      confirmLabel="Remover material"
                      variant="ghost"
                      size="icon-sm"
                      destructive
                      className="text-steel hover:text-gauge-red"
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Remover {m.productName}</span>
                    </ConfirmAction>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )
      )}
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-rime px-5 py-3 text-sm">
          <span className="text-steel">Materiais cobrados do cliente</span>
          <span className="readout font-medium text-silver">{formatBRL(charged)}</span>
        </div>
      )}
      {adding ? (
        <AddMaterialForm
          id={id}
          options={options}
          defaultLocationId={defaultLocationId}
          chargeByDefault={chargeByDefault}
          onDone={() => setAdding(false)}
        />
      ) : (
        editable &&
        items.length > 0 && (
          <div className="border-t border-rime px-5 py-3">
            <Button variant="outline" size="sm" className="h-8" onClick={() => setAdding(true)}>
              <PackagePlus className="size-4" />
              Lançar material
            </Button>
          </div>
        )
      )}
    </div>
  );
}
