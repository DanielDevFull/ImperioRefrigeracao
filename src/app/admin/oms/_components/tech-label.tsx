import { cn } from "@/lib/utils";

/** Técnico com o ponto de cor da agenda; sem técnico aparece em latão (atenção). */
export function TechLabel({
  name,
  color,
  className,
}: {
  name: string | null | undefined;
  color: string | null | undefined;
  className?: string;
}) {
  if (!name) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-brass", className)}>
        <span aria-hidden className="size-2 rounded-full border border-brass/80" />
        Sem técnico
      </span>
    );
  }
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-silver", className)}>
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color ?? "var(--ice)" }} />
      <span className="truncate">{name}</span>
    </span>
  );
}
