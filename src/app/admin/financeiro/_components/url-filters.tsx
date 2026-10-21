"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { nativeSelectClass } from "@/components/system/form";
import { addCompetence } from "@/lib/dates";
import { formatCompetence } from "@/lib/format";
import { cn } from "@/lib/utils";

function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return { params, set, pending };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Seletor de mês por ?mes=YYYY-MM com setas.
 * `optional`: sem mês definido significa "todos os meses" (listas).
 */
export function MonthFilter({
  param = "mes",
  current,
  optional = false,
  className,
}: {
  param?: string;
  /** Mês atual (YYYY-MM), usado como ponto de partida e para "voltar a hoje". */
  current: string;
  optional?: boolean;
  className?: string;
}) {
  const { params, set, pending } = useUrlParams();
  const raw = params.get(param);
  const value = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : optional ? null : current;
  const base = value ?? current;
  const label = value ? capitalize(formatCompetence(value)) : "Todos os meses";

  return (
    <div
      className={cn("inline-flex h-9 items-center rounded-lg bg-night/60 ring-1 ring-rime", className)}
      role="group"
      aria-label="Mês"
    >
      <button
        type="button"
        onClick={() => set({ [param]: addCompetence(base, -1) })}
        className="grid h-full w-9 place-items-center rounded-l-lg text-steel hover:bg-ice/10 hover:text-silver"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => set({ [param]: optional && !value ? current : null })}
        className={cn(
          "flex h-full min-w-36 items-center justify-center gap-2 px-2 text-sm tabular-nums",
          value ? "text-silver" : "text-steel",
        )}
        title={optional ? (value ? "Mostrar todos os meses" : "Filtrar pelo mês atual") : "Voltar ao mês atual"}
      >
        {pending && <Loader2 className="size-3.5 animate-spin text-steel" />}
        {label}
      </button>
      <button
        type="button"
        onClick={() => set({ [param]: addCompetence(base, 1) })}
        className="grid h-full w-9 place-items-center text-steel hover:bg-ice/10 hover:text-silver"
        aria-label="Próximo mês"
      >
        <ChevronRight className="size-4" />
      </button>
      {optional && value && (
        <button
          type="button"
          onClick={() => set({ [param]: null })}
          className="grid h-full w-8 place-items-center rounded-r-lg border-l border-rime text-steel hover:bg-ice/10 hover:text-silver"
          aria-label="Limpar filtro de mês"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** <select> nativo ligado a um parâmetro da URL. */
export function ParamSelect({
  param,
  options,
  placeholder,
  className,
  label,
}: {
  param: string;
  options: { value: string; label: string }[];
  placeholder: string;
  className?: string;
  label: string;
}) {
  const { params, set } = useUrlParams();
  return (
    <select
      aria-label={label}
      className={cn(nativeSelectClass, "w-full sm:w-auto sm:min-w-44", className)}
      value={params.get(param) ?? ""}
      onChange={(e) => set({ [param]: e.target.value || null })}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
