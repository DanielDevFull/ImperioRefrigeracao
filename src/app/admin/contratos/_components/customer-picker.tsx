"use client";

import { useState } from "react";
import { ChevronsUpDown, Loader2, UserRound } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCustomerCode, formatDocument } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PickerCustomer = {
  id: string;
  code: number;
  name: string;
  tradeName: string | null;
  document: string | null;
  status: string;
};

/** Seleção de cliente com busca por nome, nome fantasia, código ou documento. */
export function CustomerPicker({
  customers,
  value,
  onChange,
  loading,
  invalid,
}: {
  customers: PickerCustomer[];
  value: string | null;
  onChange: (id: string) => void;
  loading?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value) ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={selected ? `Cliente: ${selected.name}. Trocar cliente` : "Escolher cliente"}
          aria-describedby={invalid ? "customer-picker-error" : undefined}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-lg border bg-input/30 px-3 py-2 text-left transition-colors hover:bg-input/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
            invalid ? "border-gauge-red/60" : "border-input",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ice/10 text-ice ring-1 ring-ice/25">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <UserRound className="size-4" />}
          </span>
          {selected ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-silver">{selected.name}</span>
              <span className="block truncate text-xs text-steel">
                {formatCustomerCode(selected.code)}
                {selected.document ? `, ${formatDocument(selected.document)}` : ""}
              </span>
            </span>
          ) : (
            <span className="flex-1 text-sm text-steel">Buscar cliente pelo nome, código ou CPF/CNPJ…</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-steel" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const s = search
              .normalize("NFD")
              .replace(/[̀-ͯ]/g, "")
              .toLowerCase();
            return itemValue.includes(s) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Nome, código ou documento" />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            {customers.map((c) => {
              const haystack = [c.name, c.tradeName, formatCustomerCode(c.code), c.code, c.document, formatDocument(c.document)]
                .filter(Boolean)
                .join(" ")
                .normalize("NFD")
                .replace(/[̀-ͯ]/g, "")
                .toLowerCase();
              return (
                <CommandItem
                  key={c.id}
                  value={`${haystack} ${c.id}`}
                  disabled={c.status !== "ativo"}
                  data-checked={c.id === value}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className="py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-silver">{c.name}</span>
                    <span className="block truncate text-xs text-steel">
                      {formatCustomerCode(c.code)}
                      {c.tradeName && c.tradeName !== c.name ? `, ${c.tradeName}` : ""}
                      {c.status !== "ativo" ? ", inativo" : ""}
                    </span>
                  </span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
