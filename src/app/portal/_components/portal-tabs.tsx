"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Abas por link (?aba=), com destaque que desliza para a aba escolhida. */
export function PortalTabs({
  tabs,
  active,
  id,
  className,
}: {
  tabs: { value: string; label: string; href: string; count?: number }[];
  active: string;
  id: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Filtro"
      className={cn("-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0", className)}
    >
      <div className="inline-flex gap-1 rounded-xl bg-night/60 p-1 ring-1 ring-rime">
        {tabs.map((t) => {
          const on = t.value === active;
          return (
            <Link
              key={t.value}
              href={t.href}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition-colors sm:px-3.5",
                on ? "text-silver" : "text-steel hover:text-silver",
              )}
            >
              {on && (
                <motion.span
                  layoutId={`tabs-${id}`}
                  className="absolute inset-0 rounded-lg bg-ice/15 ring-1 ring-ice/30"
                  transition={{ type: "spring", stiffness: 450, damping: 36 }}
                />
              )}
              <span className="relative">
                {t.label}
                {t.count != null && (
                  <span className={cn("readout ml-1.5 text-xs", on ? "text-ice" : "text-steel/70")}>{t.count}</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
