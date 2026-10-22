"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Loader2, Minus, PackagePlus, Plus, Search, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/system/confirm-action";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toneOnTint } from "@/components/system/tone-badge";
import { formatBRL, formatNumber } from "@/lib/format";
import { productCategory } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { addMaterialAction, removeMaterialAction } from "../actions";
import type { CatalogItem, ExecMaterial } from "../_lib/types";

const FRACTIONAL = new Set(["kg", "L", "m"]);
const stepFor = (unit: string) => (unit === "kg" ? 0.1 : FRACTIONAL.has(unit) ? 0.5 : 1);
const round = (n: number) => Math.round(n * 1000) / 1000;

function parseQty(v: string) {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function AddMaterialSheet({
  open,
  onOpenChange,
  workOrderId,
  catalog,
  locationName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workOrderId: string;
  catalog: CatalogItem[];
  locationName: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [qty, setQty] = useState("1");
  const [charge, setCharge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // id desta tentativa de lançamento: se a resposta se perder e a pessoa tentar de novo, não baixa em dobro
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();

  const list = useMemo(() => {
    const q = query
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .trim();
    const match = (p: CatalogItem) =>
      !q ||
      `${p.name} ${p.sku ?? ""} ${productCategory[p.category] ?? ""}`
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .includes(q);
    const inVan = catalog.filter((p) => (p.available ?? 0) > 0 && match(p));
    const others = catalog.filter((p) => !((p.available ?? 0) > 0) && match(p));
    return { inVan, others };
  }, [catalog, query]);

  function choose(p: CatalogItem) {
    setSelected(p);
    setQty("1");
    setCharge(false);
    setError(null);
  }

  function reset() {
    setClientId(crypto.randomUUID());
    setSelected(null);
    setQuery("");
    setQty("1");
    setCharge(false);
    setError(null);
  }

  const amount = parseQty(qty);
  const available = selected?.available ?? 0;
  const short = selected != null && Number.isFinite(amount) && amount > available;

  function bump(dir: 1 | -1) {
    if (!selected) return;
    const step = stepFor(selected.unit);
    const cur = Number.isFinite(amount) ? amount : 0;
    const next = Math.max(step, round(cur + dir * step));
    setQty(formatNumber(next));
  }

  function submit() {
    if (!selected) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe uma quantidade maior que zero.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const r = await addMaterialAction({ workOrderId, productId: selected.id, quantity: amount, chargeCustomer: charge, clientId });
        if (r.ok === false) {
          setError(r.error ?? "Não foi possível lançar o material.");
          return;
        }
        toast.success("Material lançado", { description: `${formatNumber(amount)} ${selected.unit} de ${selected.name}` });
        reset();
        onOpenChange(false);
      } catch {
        setError("Sem conexão. Lançar material precisa de internet; tente de novo quando o sinal voltar.");
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTimeout(reset, 250);
      }}
    >
      <SheetContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        side="bottom" className="mx-auto max-h-[88dvh] max-w-xl gap-0 rounded-t-3xl border-rime bg-night p-0 pb-[env(safe-area-inset-bottom)]">
        <SheetHeader className="px-5 pb-3 pt-5">
          <SheetTitle className="font-sans text-lg font-semibold text-silver">
            {selected ? selected.name : "Adicionar material"}
          </SheetTitle>
          <SheetDescription>
            {selected
              ? selected.available != null
                ? `${formatNumber(selected.available)} ${selected.unit} em ${locationName}`
                : `Este material não está em ${locationName}`
              : `Os itens do ${locationName.toLowerCase().startsWith("veículo") ? "seu veículo" : "estoque"} aparecem primeiro.`}
          </SheetDescription>
        </SheetHeader>

        {!selected ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-5 pb-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-steel" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar material"
                  type="search"
                  className="h-12 rounded-xl pl-10 text-base"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5">
              {list.inVan.length > 0 && (
                <>
                  <p className="flex items-center gap-1.5 px-2 pb-1.5 pt-1 text-xs font-medium text-steel">
                    <Truck className="size-3.5" />
                    No veículo
                  </p>
                  <ul>
                    {list.inVan.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => choose(p)}
                          className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-ice/10"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.95rem] text-silver">{p.name}</span>
                            <span className="block text-xs text-steel">{productCategory[p.category] ?? p.category}</span>
                          </span>
                          <span className="readout shrink-0 text-sm font-semibold text-mint">
                            {formatNumber(p.available)} {p.unit}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {list.others.length > 0 && (
                <>
                  <p className="px-2 pb-1.5 pt-4 text-xs font-medium text-steel">Fora do veículo</p>
                  <ul>
                    {list.others.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => choose(p)}
                          className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-ice/10"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.95rem] text-silver">{p.name}</span>
                            <span className="block text-xs text-steel">{productCategory[p.category] ?? p.category}</span>
                          </span>
                          <span className="readout shrink-0 text-sm text-steel">
                            {p.available != null ? `${formatNumber(p.available)} ${p.unit}` : "sem saldo"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!list.inVan.length && !list.others.length && (
                <p className="px-2 py-8 text-center text-sm text-steel">Nenhum material encontrado para “{query}”.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5 px-5 pb-5">
            <div>
              <p className="mb-2 text-sm font-medium text-silver">Quantidade ({selected.unit})</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Diminuir"
                  onClick={() => bump(-1)}
                  className="grid size-14 shrink-0 place-items-center rounded-2xl bg-glacier text-silver ring-1 ring-rime active:bg-glacier-2"
                >
                  <Minus className="size-5" />
                </button>
                <input
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, "").slice(0, 8))}
                  aria-label="Quantidade"
                  className="readout h-14 min-w-0 flex-1 rounded-2xl bg-abyss/50 text-center text-2xl font-semibold text-silver outline-none ring-1 ring-steel/30 light:ring-steel/70 focus:ring-2 focus:ring-ice"
                />
                <button
                  type="button"
                  aria-label="Aumentar"
                  onClick={() => bump(1)}
                  className="grid size-14 shrink-0 place-items-center rounded-2xl bg-glacier text-silver ring-1 ring-rime active:bg-glacier-2"
                >
                  <Plus className="size-5" />
                </button>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {short && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <span className={cn("flex gap-2.5 rounded-xl bg-brass/10 px-3.5 py-3 text-sm ring-1 ring-brass/30 light:bg-notice-brass", toneOnTint.brass)}>
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {available > 0
                        ? `O veículo tem só ${formatNumber(available)} ${selected.unit}.`
                        : "Este material não consta no seu veículo."}{" "}
                      Você pode lançar mesmo assim; o saldo fica negativo e o estoque do escritório é avisado.
                    </span>
                  </span>
                </motion.p>
              )}
            </AnimatePresence>
            <label className="flex min-h-14 items-center gap-3 rounded-2xl bg-glacier/50 px-4 py-3 ring-1 ring-rime">
              <span className="flex-1">
                <span className="block text-[0.95rem] font-medium text-silver">Cobrar do cliente</span>
                <span className="block text-xs text-steel">
                  {selected.salePrice > 0
                    ? `${formatBRL(selected.salePrice)} por ${selected.unit}${Number.isFinite(amount) && amount > 0 ? `, total ${formatBRL(selected.salePrice * amount)}` : ""}`
                    : "Material sem preço de venda cadastrado"}
                </span>
              </span>
              <Switch checked={charge} onCheckedChange={setCharge} aria-label="Cobrar do cliente" />
            </label>
            {error && (
              <p role="alert" className={cn("rounded-xl bg-gauge-red/10 px-3.5 py-2.5 text-sm ring-1 ring-gauge-red/30", toneOnTint.red)}>
                {error}
              </p>
            )}
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="h-14 rounded-2xl px-5 text-sm font-medium text-steel ring-1 ring-rime active:bg-ice/5"
              >
                Trocar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-ice to-ice-deep text-[0.98rem] font-semibold text-abyss disabled:opacity-60"
              >
                {pending && <Loader2 className="size-5 animate-spin" />}
                Lançar material
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function Materials({
  workOrderId,
  materials,
  catalog,
  locationName,
  closed,
  online,
}: {
  workOrderId: string;
  materials: ExecMaterial[];
  catalog: CatalogItem[];
  locationName: string;
  closed: boolean;
  online: boolean;
}) {
  const [open, setOpen] = useState(false);
  const charged = materials.filter((m) => m.chargeCustomer).reduce((s, m) => s + m.quantity * m.unitPrice, 0);
  return (
    <div className="space-y-3">
      {materials.length > 0 ? (
        <ul className="divide-y divide-rime overflow-hidden rounded-2xl bg-night/50 ring-1 ring-rime">
          <AnimatePresence initial={false}>
            {materials.map((m) => (
              <motion.li
                key={m.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 py-2.5 pl-4 pr-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] text-silver">{m.name}</p>
                  <p className="text-xs text-steel">
                    <span className="readout">
                      {formatNumber(m.quantity)} {m.unit}
                    </span>
                    {m.chargeCustomer && (
                      <span className="text-brass">
                        {m.unitPrice > 0 ? `, cobrado ${formatBRL(m.quantity * m.unitPrice)}` : ", cobrar do cliente (sem preço cadastrado)"}
                      </span>
                    )}
                  </p>
                </div>
                {!closed && (
                  <ConfirmAction
                    action={removeMaterialAction.bind(null, m.id)}
                    title="Remover este material?"
                    description={`${formatNumber(m.quantity)} ${m.unit} de ${m.name} voltam para o estoque de onde saíram.`}
                    confirmLabel="Remover material"
                    success="Material removido"
                    variant="ghost"
                    destructive
                    className="size-11 text-steel"
                  >
                    <X className="size-5" />
                    <span className="sr-only">Remover {m.name}</span>
                  </ConfirmAction>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="rounded-2xl bg-night/50 px-4 py-4 text-sm text-steel ring-1 ring-rime">
          {closed ? "Nenhum material lançado nesta OM." : "Nenhum material lançado. Registre o que usar do veículo para manter o estoque certo."}
        </p>
      )}
      {charged > 0 && (
        <p className="px-1 text-sm text-steel">
          Materiais cobrados do cliente: <span className="readout font-semibold text-brass">{formatBRL(charged)}</span>
        </p>
      )}
      {!closed && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!online}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-glacier text-[0.98rem] font-semibold text-silver ring-1 ring-ice/30 active:bg-glacier-2 disabled:opacity-50"
          >
            <PackagePlus className="size-5 text-ice" />
            Adicionar material
          </button>
          {!online && <p className="text-xs text-brass">Lançar material precisa de internet (o estoque é atualizado na hora).</p>}
          <AddMaterialSheet open={open} onOpenChange={setOpen} workOrderId={workOrderId} catalog={catalog} locationName={locationName} />
        </>
      )}
    </div>
  );
}
