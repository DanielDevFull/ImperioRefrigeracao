"use client";

import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { nativeSelectClass } from "@/components/system/form";
import { cn } from "@/lib/utils";

export type PickerOption = { id: string; name: string; sku: string | null; unit: string; hint?: string };

/** Seletor de produto com busca por nome ou SKU; envia o id em um campo oculto. */
export function ProductPicker({
  products,
  value,
  onChange,
  name = "productId",
  id,
  invalid,
  placeholder = "Escolha o produto",
}: {
  products: PickerOption[];
  value: string;
  onChange: (id: string) => void;
  name?: string;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = products.find((p) => p.id === value);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-invalid={invalid || undefined}
            className={cn(
              nativeSelectClass,
              "flex items-center justify-between gap-2 text-left aria-invalid:border-gauge-red",
            )}
          >
            <span className={cn("min-w-0 truncate", !selected && "text-steel")}>
              {selected ? selected.name : placeholder}
            </span>
            {selected?.sku && <span className="ml-auto shrink-0 text-xs text-steel">{selected.sku}</span>}
            <ChevronsUpDown className="size-4 shrink-0 text-steel" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar por nome ou SKU" />
            <CommandList id={listId}>
              <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
              <CommandGroup>
                {products.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    keywords={[p.name, p.sku ?? ""]}
                    onSelect={() => {
                      onChange(p.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("size-4", p.id === value ? "text-ice" : "opacity-0")} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.hint ? (
                      <span className="shrink-0 text-xs tabular-nums text-steel">{p.hint}</span>
                    ) : (
                      p.sku && <span className="shrink-0 text-xs text-steel">{p.sku}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
