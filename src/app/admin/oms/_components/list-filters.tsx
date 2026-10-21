"use client";

import { useState } from "react";
import { AlarmClock, SlidersHorizontal, X } from "lucide-react";
import { SearchInput } from "@/components/system/list-controls";
import { nativeSelectClass } from "@/components/system/form";
import { cn } from "@/lib/utils";
import { ORIGINS, WORK_ORDER_TYPES } from "../_lib/constants";
import { useUrlParams } from "./use-url-params";

const FILTER_KEYS = ["tipo", "tecnico", "origem", "de", "ate", "filtro"] as const;

const dateClass =
  "h-7 w-[8.4rem] rounded-md bg-transparent px-1.5 text-sm text-silver outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [color-scheme:dark]";

export function ListFilters({
  technicians,
  overdue,
}: {
  technicians: { id: string; name: string }[];
  overdue: number;
}) {
  const { set, params, pending } = useUrlParams();
  const [open, setOpen] = useState(false);
  const value = (k: string) => params.get(k) ?? "";
  const activeCount = FILTER_KEYS.filter((k) => params.get(k)).length;
  const lateOn = value("filtro") === "atrasadas";

  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-70")}>
      <div className="flex w-full gap-2 md:w-auto">
        <SearchInput placeholder="Título, OM-000123 ou cliente" className="flex-1 md:w-72 md:flex-none" />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm text-steel ring-1 ring-rime md:hidden"
        >
          <SlidersHorizontal className="size-4" />
          Filtros
          {activeCount > 0 && <span className="readout text-xs text-ice">{activeCount}</span>}
        </button>
      </div>

      <div className={cn("w-full flex-wrap items-center gap-2 md:contents", open ? "flex" : "hidden")}>
        <select
          aria-label="Tipo de OM"
          className={cn(nativeSelectClass, "w-[calc(50%-0.25rem)] md:w-36")}
          value={value("tipo")}
          onChange={(e) => set({ tipo: e.target.value })}
        >
          <option value="">Todos os tipos</option>
          {WORK_ORDER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Técnico"
          className={cn(nativeSelectClass, "w-[calc(50%-0.25rem)] md:w-44")}
          value={value("tecnico")}
          onChange={(e) => set({ tecnico: e.target.value })}
        >
          <option value="">Todos os técnicos</option>
          <option value="nenhum">Sem técnico</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Origem"
          className={cn(nativeSelectClass, "w-[calc(50%-0.25rem)] md:w-40")}
          value={value("origem")}
          onChange={(e) => set({ origem: e.target.value })}
        >
          <option value="">Todas as origens</option>
          {ORIGINS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="flex h-9 w-full items-center gap-1 rounded-md px-2 ring-1 ring-input md:w-auto" role="group" aria-label="Período agendado">
          <span className="pr-1 text-sm text-steel">Agendada de</span>
          <input
            type="date"
            aria-label="Agendada a partir de"
            className={dateClass}
            value={value("de")}
            max={value("ate") || undefined}
            onChange={(e) => set({ de: e.target.value })}
          />
          <span className="text-sm text-steel">até</span>
          <input
            type="date"
            aria-label="Agendada até"
            className={dateClass}
            value={value("ate")}
            min={value("de") || undefined}
            onChange={(e) => set({ ate: e.target.value })}
          />
        </div>

        <button
          type="button"
          aria-pressed={lateOn}
          onClick={() => set({ filtro: lateOn ? null : "atrasadas" })}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm ring-1 transition-colors",
            lateOn ? "bg-gauge-red/15 text-gauge-red ring-gauge-red/40" : "text-steel ring-rime hover:text-silver hover:ring-ice/30",
          )}
        >
          <AlarmClock className="size-4" />
          Atrasadas
          <span className={cn("readout text-xs", lateOn || overdue ? "text-gauge-red" : "text-steel/70")}>{overdue}</span>
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-steel hover:text-frost"
          >
            <X className="size-4" />
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
