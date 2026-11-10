"use client";

import { useId, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QuoteProduct } from "../_lib/queries";

/** Escolha do produto do estoque para um item de material (preço de venda sugerido). */
export function ProductPicker({
  products,
  value,
  label,
  onChange,
  invalid,
  id,
}: {
  products: QuoteProduct[];
  value: string | null;
  /** Nome mostrado quando o produto não está mais na lista (inativo) */
  label?: string;
  onChange: (p: QuoteProduct) => void;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const current = products.find((p) => p.id === value);
  const text = current?.name ?? (value ? label : null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-input/30 px-3 text-left text-sm outline-none transition-colors hover:bg-input/50 light:bg-transparent light:hover:bg-input/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-gauge-red/60",
            !text && "text-muted-foreground",
          )}
        >
          <span className="min-w-0 truncate">{text ? <span className="text-silver">{text}</span> : "Escolher produto do estoque"}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-steel" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] p-0">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}>
          <CommandInput placeholder="Nome ou código do produto" />
          <CommandList id={listId}>
            <CommandEmpty>Nenhum produto encontrado. Para algo fora do estoque, use um item de serviço.</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.sku ?? ""} ${p.id}`}
                  data-checked={p.id === value}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                  className="py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-silver">{p.name}</span>
                    <span className="block truncate text-xs text-steel">
                      {p.sku ? `${p.sku}, ` : ""}
                      {p.salePrice > 0 ? `${formatBRL(p.salePrice)} por ${p.unit}` : `sem preço de venda, por ${p.unit}`}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
