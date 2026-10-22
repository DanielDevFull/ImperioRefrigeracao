"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function useSetParam() {
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
    if (!("page" in patch)) next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return { set, params, pending };
}

/** Busca que atualiza ?q= na URL (com atraso de digitação). */
export function SearchInput({ placeholder = "Buscar…", className, param = "q" }: { placeholder?: string; className?: string; param?: string }) {
  const { set, params, pending } = useSetParam();
  const urlValue = params.get(param) ?? "";
  const [value, setValue] = useState(urlValue);
  // Valores que esta busca escreveu na URL e que ela ainda não alcançou, e o último valor da URL já visto.
  const [pushed, setPushed] = useState<string[]>([urlValue]);
  const [seen, setSeen] = useState(urlValue);
  if (urlValue !== seen) {
    setSeen(urlValue);
    if (urlValue === pushed[pushed.length - 1]) {
      // A URL alcançou o que foi digitado: nada muda (não apaga o que ainda está sendo digitado).
      setPushed([urlValue]);
    } else if (!pushed.includes(urlValue)) {
      // A URL mudou por fora (Limpar filtros, menu lateral, voltar/avançar): a caixa acompanha.
      setPushed([urlValue]);
      setValue(urlValue);
    }
  }
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get(param) ?? "") !== value) {
        setPushed((p) => [...p, value]);
        set({ [param]: value || null });
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      {pending ? (
        <Loader2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-steel" />
      ) : (
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" />
      )}
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="pl-9" type="search" />
    </div>
  );
}

/** Abas de filtro que atualizam um parâmetro da URL (ex.: ?status=). */
export function FilterTabs({
  param = "status",
  options,
  className,
}: {
  param?: string;
  options: { value: string; label: string; count?: number }[];
  className?: string;
}) {
  const { set, params } = useSetParam();
  const current = params.get(param) ?? "";
  return (
    <div className={cn("flex flex-wrap gap-1 rounded-xl bg-night/60 p-1 ring-1 ring-rime", className)} role="tablist">
      {options.map((o) => {
        const active = current === o.value;
        return (
          <button
            key={o.value || "all"}
            role="tab"
            aria-selected={active}
            onClick={() => set({ [param]: o.value || null })}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              active ? "bg-ice/15 text-silver ring-1 ring-ice/30" : "text-steel hover:text-silver",
            )}
          >
            {o.label}
            {o.count != null && <span className={cn("ml-1.5 text-xs", active ? "text-ice" : "text-steel/70")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Paginação simples por ?page=. */
export function Pager({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const { set } = useSetParam();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-rime px-5 py-3 text-sm text-steel">
      <span>
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="grid size-8 place-items-center rounded-md hover:bg-ice/10 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => set({ page: String(page - 1) })}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2 text-silver">
          {page} / {pages}
        </span>
        <button
          className="grid size-8 place-items-center rounded-md hover:bg-ice/10 disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => set({ page: String(page + 1) })}
          aria-label="Próxima página"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

