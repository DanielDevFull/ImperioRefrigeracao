import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cabeçalho de página: título em Cinzel prateado, descrição curta e ações à direita. */
export function PageHeader({
  title,
  description,
  actions,
  back,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1 text-sm text-steel transition-colors hover:text-frost"
          >
            <ChevronLeft className="size-4" />
            {back.label}
          </Link>
        )}
        <h1 className="font-display text-silver-brushed text-2xl font-semibold tracking-[0.02em] md:text-[2rem] md:leading-tight">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-steel">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
