import { cn } from "@/lib/utils";

/** Painel com título opcional; base para tabelas, formulários e listas. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Sem padding interno (tabelas encostam na borda) */
  flush?: boolean;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-rime px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[0.95rem] font-semibold text-silver">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-steel">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Lista de pares rótulo/valor (fichas de cliente, equipamento, OM). */
export function DetailList({
  items,
  className,
  columns = 2,
}: {
  items: { label: string; value: React.ReactNode }[];
  className?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs text-steel">{it.label}</dt>
          <dd className="mt-0.5 truncate text-sm text-silver">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
