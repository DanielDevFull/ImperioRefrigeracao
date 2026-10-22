import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Rodapé com os totais do conjunto filtrado (todas as páginas). */
export function TotalsBar({ items }: { items: { label: string; value: number | null; tone?: string }[] }) {
  return (
    <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-rime bg-muted/40 px-5 py-3 text-sm">
      {items.map((it) =>
        it.value == null ? (
          <div key={it.label} className="mr-auto text-steel">
            <dt className="sr-only">Quantidade</dt>
            <dd>{it.label} no filtro</dd>
          </div>
        ) : (
          <div key={it.label} className="flex items-baseline gap-2">
            <dt className="text-steel">{it.label}</dt>
            <dd className={cn("font-medium tabular-nums text-silver", it.tone)}>{formatBRL(it.value)}</dd>
          </div>
        ),
      )}
    </dl>
  );
}
