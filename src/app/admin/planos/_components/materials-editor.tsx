"use client";

import { AnimatePresence, motion } from "motion/react";
import { PackagePlus, Trash2 } from "lucide-react";
import { nativeSelectClass } from "@/components/system/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { productUnit } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { formatQty, parseQty, type DraftMaterial, type ProductOption } from "./types";
import { SelectField } from "@/components/system/fields";

export function MaterialsEditor({
  materials,
  products,
  visitsPerYear,
  errors,
  focusKey,
  onChange,
  onRemove,
  onAdd,
}: {
  materials: DraftMaterial[];
  products: ProductOption[];
  visitsPerYear: number;
  /** erros indexados pela chave da linha */
  errors: Record<string, { productId?: string; quantity?: string }>;
  focusKey: string | null;
  onChange: (key: string, patch: Partial<DraftMaterial>) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return (
    <div>
      {materials.length === 0 && (
        <p className="rounded-xl border border-dashed border-rime-strong px-4 py-6 text-center text-sm text-steel">
          Sem materiais previstos. Inclua filtros, bactericida ou gás para que a previsão de compras considere este plano.
        </p>
      )}
      <ul className="space-y-2">
        <AnimatePresence initial={false} mode="popLayout">
          {materials.map((m) => {
            const product = byId.get(m.productId);
            const qty = parseQty(m.quantity);
            const err = errors[m.key] ?? {};
            const taken = new Set(materials.filter((o) => o.key !== m.key).map((o) => o.productId));
            const unit = product ? (productUnit[product.unit] ?? product.unit) : "";
            return (
              <motion.li
                key={m.key}
                layout="position"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -24, transition: { duration: 0.16 } }}
                transition={{ type: "spring", stiffness: 520, damping: 42 }}
                className="rounded-xl border border-rime bg-night/55 p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                    <div className="min-w-0">
                      <SelectField
                        value={m.productId}
                        onChange={(e) => onChange(m.key, { productId: e.target.value })}
                        className={cn(nativeSelectClass, err.productId && "border-gauge-red/60")}
                        aria-label="Produto"
                        autoFocus={m.key === focusKey}
                      >
                        <option value="">Escolha o produto…</option>
                        {products
                          .filter((p) => (p.active || p.id === m.productId) && !taken.has(p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.sku ? ` (${p.sku})` : ""}
                            </option>
                          ))}
                      </SelectField>
                      {err.productId && <p className="mt-1 text-xs text-gauge-red">{err.productId}</p>}
                    </div>
                    <div>
                      <div className="relative">
                        <Input
                          value={m.quantity}
                          onChange={(e) => onChange(m.key, { quantity: e.target.value.replace(/[^\d.,]/g, "") })}
                          inputMode="decimal"
                          placeholder="Qtd."
                          aria-label="Quantidade por visita"
                          aria-invalid={err.quantity ? true : undefined}
                          className="h-9 pr-14 text-right tabular-nums"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-steel">
                          {product?.unit ?? ""}
                        </span>
                      </div>
                      {err.quantity && <p className="mt-1 text-xs text-gauge-red">{err.quantity}</p>}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRemove(m.key)}
                    aria-label="Remover material"
                    className="mt-1 text-steel hover:bg-gauge-red/10 hover:text-gauge-red"
                  >
                    <Trash2 />
                  </Button>
                </div>
                {product && qty != null && qty > 0 && (
                  <p className="mt-2 text-xs text-steel">
                    Por equipamento, cerca de{" "}
                    <span className="tabular-nums text-silver">
                      {formatQty(qty * visitsPerYear)} {unit}
                    </span>{" "}
                    por ano.
                  </p>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <Button type="button" variant="outline" onClick={onAdd} className="mt-3 h-9" disabled={products.length === 0}>
        <PackagePlus />
        Adicionar material
      </Button>
      {products.length === 0 && (
        <p className="mt-2 text-xs text-steel">Cadastre produtos no estoque para incluí-los aqui.</p>
      )}
    </div>
  );
}
