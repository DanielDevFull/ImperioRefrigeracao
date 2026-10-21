"use client";

import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCustomerCode, formatDocument } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CustomerOption = {
  id: string;
  code: number;
  name: string;
  tradeName: string | null;
  document: string | null;
};

/** Seletor de cliente com busca por nome, nome fantasia, código ou documento. */
export function CustomerPicker({
  customers,
  value,
  onChange,
  invalid,
  id,
}: {
  customers: CustomerOption[];
  value: string | null;
  onChange: (id: string) => void;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = customers.find((c) => c.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls="customer-picker-list"
          aria-invalid={invalid || undefined}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-input/30 px-3 text-left text-sm outline-none transition-colors hover:bg-input/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-gauge-red/60",
            !current && "text-muted-foreground",
          )}
        >
          <span className="min-w-0 truncate">
            {current ? (
              <>
                <span className="text-silver">{current.tradeName ?? current.name}</span>
                {current.tradeName && <span className="ml-2 text-steel">{current.name}</span>}
              </>
            ) : (
              "Buscar cliente pelo nome, código ou documento"
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-steel" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(32rem,calc(100vw-2rem))] p-0">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}
        >
          <CommandInput placeholder="Nome, CLI-0001 ou CPF/CNPJ" />
          <CommandList id="customer-picker-list">
            <CommandEmpty>Nenhum cliente encontrado. Cadastre o cliente antes de abrir a OM.</CommandEmpty>
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.tradeName ?? ""} ${formatCustomerCode(c.code)} ${c.document ?? ""} ${formatDocument(c.document)} ${c.id}`}
                  data-checked={c.id === value}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className="py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-silver">{c.tradeName ?? c.name}</span>
                    <span className="block truncate text-xs text-steel">
                      {formatCustomerCode(c.code)}
                      {c.tradeName ? `, ${c.name}` : ""}
                      {c.document ? `, ${formatDocument(c.document)}` : ""}
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
