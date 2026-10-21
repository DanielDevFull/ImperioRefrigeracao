"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/system/masked-input";
import { SubmitButton, useActionToast } from "@/components/system/form";
import { initialActionState } from "@/lib/action";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductPicker } from "../../../../estoque/_components/product-picker";
import { formatQty, parseDecimal, round2 } from "../../../../estoque/_lib/stock-format";
import type { PickerProduct } from "../../../../estoque/_lib/types";
import { addOrderItem, removeOrderItem, updateOrderItem } from "../actions";

export type ItemRow = {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  quantity: number;
  unitCost: number;
  receivedQuantity: number;
};

const qtyText = (n: number) => String(n).replace(".", ",");
const cents = (v: string) => Number(v.replace(/\D/g, "") || 0) / 100;

/** Itens do pedido: editáveis no rascunho, com o recebido depois de enviado. */
export function OrderItems({
  orderId,
  items,
  editable,
  products,
  freight,
  total,
}: {
  orderId: string;
  items: ItemRow[];
  editable: boolean;
  products: PickerProduct[];
  freight: number;
  total: number;
}) {
  const showReceived = !editable;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-rime text-left text-steel">
              <th className="h-10 pl-5 font-medium">Produto</th>
              <th className="h-10 px-2 text-right font-medium">Quantidade</th>
              <th className="h-10 px-2 text-right font-medium">Custo unitário</th>
              {showReceived && <th className="h-10 px-2 text-right font-medium">Recebido</th>}
              <th className="h-10 px-2 text-right font-medium">Subtotal</th>
              {editable && (
                <th className="h-10 pr-5">
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {items.map((it) =>
                editable ? (
                  <EditableRow key={it.id} item={it} />
                ) : (
                  <motion.tr key={it.id} layout className="border-b border-rime last:border-0">
                    <td className="py-3 pl-5">
                      <ProductCell item={it} />
                    </td>
                    <td className="px-2 text-right tabular-nums text-silver">{formatQty(it.quantity, it.unit)}</td>
                    <td className="px-2 text-right tabular-nums text-steel">{formatBRL(it.unitCost)}</td>
                    <td className="px-2 text-right">
                      <ReceivedCell item={it} />
                    </td>
                    <td className="px-2 pr-5 text-right tabular-nums text-silver">{formatBRL(round2(it.quantity * it.unitCost))}</td>
                  </motion.tr>
                ),
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {items.length === 0 && (
        <p className="px-5 py-6 text-center text-sm text-steel">
          Nenhum item ainda. {editable ? "Adicione os produtos abaixo." : ""}
        </p>
      )}

      {editable && <AddItemForm orderId={orderId} products={products} />}

      <dl className="ml-auto grid w-full max-w-xs gap-1.5 border-t border-rime px-5 py-4 text-sm sm:border-t-0">
        <div className="flex justify-between gap-4">
          <dt className="text-steel">Itens</dt>
          <dd className="tabular-nums text-silver">{formatBRL(total)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-steel">Frete</dt>
          <dd className="tabular-nums text-silver">{formatBRL(freight)}</dd>
        </div>
        <div className="mt-1 flex justify-between gap-4 border-t border-rime pt-2">
          <dt className="font-medium text-silver">Total</dt>
          <dd className="readout text-base font-semibold text-silver">{formatBRL(total + freight)}</dd>
        </div>
      </dl>
    </div>
  );
}

function ProductCell({ item }: { item: ItemRow }) {
  return (
    <div className="min-w-0">
      <Link href={`/admin/estoque/${item.productId}`} className="block max-w-72 truncate text-silver hover:text-frost">
        {item.name}
      </Link>
      <span className="text-xs text-steel">{item.sku ?? "Sem SKU"}</span>
    </div>
  );
}

function ReceivedCell({ item }: { item: ItemRow }) {
  const ratio = item.quantity > 0 ? Math.min(1, item.receivedQuantity / item.quantity) : 0;
  const done = ratio >= 1;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className={cn("tabular-nums", done ? "text-mint" : item.receivedQuantity > 0 ? "text-brass" : "text-steel")}>
        {formatQty(item.receivedQuantity, item.unit)}
      </span>
      <span className="h-1 w-16 overflow-hidden rounded-full bg-ice/10" aria-hidden>
        <span className={cn("block h-full rounded-full", done ? "bg-mint" : "bg-brass")} style={{ width: `${ratio * 100}%` }} />
      </span>
    </span>
  );
}

function EditableRow({ item }: { item: ItemRow }) {
  const [state, action, pending] = useActionState(updateOrderItem, initialActionState);
  // null = sem edição local (mostra o valor salvo, que pode mudar pelo servidor)
  const [editedQty, setEditedQty] = useState<string | null>(null);
  const [editedCost, setEditedCost] = useState<number | null>(null);
  useActionToast(state, {
    onSuccess: () => {
      setEditedQty(null);
      setEditedCost(null);
    },
  });
  const [removing, startRemove] = useTransition();
  const qty = editedQty ?? qtyText(item.quantity);
  const cost = editedCost ?? item.unitCost;
  const q = parseDecimal(qty) ?? 0;
  const dirty = q !== item.quantity || cost !== item.unitCost;
  const formId = `item-${item.id}`;
  return (
    <motion.tr
      layout
      initial={{ opacity: 0, backgroundColor: "rgba(56,168,255,0.10)" }}
      animate={{ opacity: removing ? 0.4 : 1, backgroundColor: "rgba(56,168,255,0)" }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.35 }}
      className="border-b border-rime last:border-0"
    >
      <td className="py-2.5 pl-5">
        <form id={formId} action={action}>
          <input type="hidden" name="itemId" value={item.id} />
        </form>
        <ProductCell item={item} />
      </td>
      <td className="px-2 text-right">
        <div className="relative ml-auto w-32">
          <Input
            form={formId}
            name="quantity"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setEditedQty(e.target.value.replace(/[^\d.,]/g, ""))}
            className="h-8 pr-9 text-right tabular-nums"
            aria-label={`Quantidade de ${item.name}`}
            aria-invalid={Boolean(state.fieldErrors?.quantity) || undefined}
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-steel">{item.unit}</span>
        </div>
      </td>
      <td className="px-2 text-right">
        <MaskedInput
          key={item.unitCost}
          form={formId}
          name="unitCost"
          mask="money"
          defaultValue={item.unitCost}
          onInput={(e) => setEditedCost(cents((e.target as HTMLInputElement).value))}
          className="ml-auto h-8 w-28 text-right tabular-nums"
          aria-label={`Custo unitário de ${item.name}`}
        />
      </td>
      <td className="px-2 text-right tabular-nums text-silver">{formatBRL(round2(q * cost))}</td>
      <td className="pr-5">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="submit"
            form={formId}
            size="icon-sm"
            variant={dirty ? "default" : "ghost"}
            disabled={!dirty || pending}
            aria-label="Salvar item"
            className={cn(!dirty && "invisible")}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-steel hover:text-gauge-red"
            aria-label={`Remover ${item.name}`}
            disabled={removing}
            onClick={() =>
              startRemove(async () => {
                const r = await removeOrderItem(item.id);
                if (r.ok === false || r.error) toast.error(r.error ?? "Não foi possível remover o item.");
                else toast.success(r.message ?? "Item removido");
              })
            }
          >
            {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>
      </td>
    </motion.tr>
  );
}

function AddItemForm({ orderId, products }: { orderId: string; products: PickerProduct[] }) {
  const [state, action] = useActionState(addOrderItem, initialActionState);
  const [productId, setProductId] = useState("");
  const [round, setRound] = useState(0);
  useActionToast(state, {
    onSuccess: () => {
      setProductId("");
      setRound((n) => n + 1);
    },
  });
  const product = products.find((p) => p.id === productId);
  const e = state.fieldErrors ?? {};
  return (
    <form
      key={round}
      action={action}
      className="grid gap-3 border-t border-rime bg-night/40 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] sm:items-end"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <div className="space-y-1.5">
        <label htmlFor="add-product" className="text-xs text-steel">
          Adicionar produto
        </label>
        <ProductPicker id="add-product" products={products} value={productId} onChange={setProductId} invalid={Boolean(e.productId)} />
        {e.productId && <p className="text-xs text-gauge-red">{e.productId}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="add-qty" className="text-xs text-steel">
          Quantidade
        </label>
        <div className="relative">
          <Input id="add-qty" name="quantity" inputMode="decimal" className="h-9 pr-9 tabular-nums" placeholder="0" aria-invalid={Boolean(e.quantity) || undefined} />
          {product && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-steel">{product.unit}</span>}
        </div>
        {e.quantity && <p className="text-xs text-gauge-red">{e.quantity}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="add-cost" className="text-xs text-steel">
          Custo unitário
        </label>
        <MaskedInput key={productId} id="add-cost" name="unitCost" mask="money" defaultValue={product?.costPrice ?? 0} className="h-9 tabular-nums" />
      </div>
      <SubmitButton variant="outline" className="h-9">
        Adicionar item
      </SubmitButton>
    </form>
  );
}
