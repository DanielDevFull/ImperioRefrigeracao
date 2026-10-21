"use client";

import { useId, useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Campo de escolha com busca (cliente, fornecedor). Envia o id em um input oculto. */
export function OptionPicker({
  id,
  name,
  options,
  placeholder,
  searchPlaceholder = "Buscar…",
  emptyText = "Nada encontrado.",
  defaultValue = "",
}: {
  id?: string;
  name: string;
  options: { value: string; label: string; hint?: string | null }[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  defaultValue?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected ? "text-silver" : "text-steel",
              selected && "pr-9",
            )}
          >
            <span className="truncate">{selected?.label ?? placeholder}</span>
            {!selected && <ChevronsUpDown className="size-4 shrink-0 opacity-60" />}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList id={listId}>
              <CommandEmpty>{emptyText}</CommandEmpty>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                  data-checked={o.value === value}
                  onSelect={() => {
                    setValue(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block truncate text-xs text-steel">{o.hint}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-steel hover:bg-ice/10 hover:text-silver"
          aria-label="Limpar escolha"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
