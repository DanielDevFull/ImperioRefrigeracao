"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Abas de seção (links) com o indicador deslizando para a aba escolhida. */
export function SectionTabs({
  tabs,
  current,
  layoutId,
  className,
}: {
  tabs: { value: string; label: string; href: string; count?: number }[];
  current: string;
  layoutId: string;
  className?: string;
}) {
  return (
    <nav className={cn("mb-4 flex gap-6 border-b border-rime", className)} aria-label="Seções">
      {tabs.map((t) => {
        const active = t.value === current;
        return (
          <Link
            key={t.value}
            href={t.href}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px pb-3 pt-1 text-sm transition-colors",
              active ? "text-silver" : "text-steel hover:text-silver",
            )}
          >
            {t.label}
            {t.count != null && <span className={cn("ml-1.5 text-xs tabular-nums", active ? "text-ice" : "text-steel/70 light:text-steel")}>{t.count}</span>}
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ice"
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
