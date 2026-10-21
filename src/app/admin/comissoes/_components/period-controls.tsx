"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { nativeSelectClass } from "@/components/system/form";
import { addCompetence } from "@/lib/dates";
import { formatCompetence } from "@/lib/format";
import { cn } from "@/lib/utils";

function useParamNav() {
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
  return { set, pending };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Seletor de competência (?periodo=YYYY-MM) com mês anterior/próximo. */
export function PeriodPicker({ period, current }: { period: string; current: string }) {
  const { set, pending } = useParamNav();
  const go = (p: string) => set({ periodo: p === current ? null : p });
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-night/60 p-1 ring-1 ring-rime">
      <button
        type="button"
        onClick={() => go(addCompetence(period, -1))}
        className="grid size-8 place-items-center rounded-lg text-steel hover:bg-ice/10 hover:text-silver"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="flex min-w-40 items-center justify-center gap-2 px-2 text-sm font-medium text-silver" aria-live="polite">
        {pending && <Loader2 className="size-3.5 animate-spin text-steel" />}
        {cap(formatCompetence(period))}
      </span>
      <button
        type="button"
        onClick={() => go(addCompetence(period, 1))}
        disabled={period >= current}
        className="grid size-8 place-items-center rounded-lg text-steel hover:bg-ice/10 hover:text-silver disabled:pointer-events-none disabled:opacity-30"
        aria-label="Próximo mês"
      >
        <ChevronRight className="size-4" />
      </button>
      {period !== current && (
        <button
          type="button"
          onClick={() => go(current)}
          className="rounded-lg px-2.5 py-1.5 text-xs text-ice hover:bg-ice/10"
        >
          Mês atual
        </button>
      )}
    </div>
  );
}

/** Select nativo que grava a escolha num parâmetro da URL. */
export function ParamSelect({
  param,
  value,
  options,
  placeholder,
  label,
  className,
}: {
  param: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  label: string;
  className?: string;
}) {
  const { set } = useParamNav();
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => set({ [param]: e.target.value || null })}
      className={cn(nativeSelectClass, "h-10 w-full sm:w-60", className)}
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
