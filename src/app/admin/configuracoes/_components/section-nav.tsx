"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type SectionLink = { id: string; label: string };

/** Índice das seções: acompanha a rolagem e destaca a seção visível. */
export function SectionNav({ sections }: { sections: SectionLink[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  return (
    <>
      {/* Desktop: índice lateral fixo */}
      <nav aria-label="Seções das configurações" className="sticky top-24 hidden self-start lg:block">
        <ul className="space-y-0.5">
          {sections.map((s) => (
            <li key={s.id} className="relative">
              {active === s.id && (
                <motion.span
                  layoutId="settings-nav-active"
                  className="absolute inset-0 rounded-lg bg-ice/10 ring-1 ring-ice/20"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
              <a
                href={`#${s.id}`}
                onClick={() => setActive(s.id)}
                className={cn(
                  "relative block rounded-lg px-3 py-2 text-sm transition-colors",
                  active === s.id ? "text-silver" : "text-steel hover:text-silver",
                )}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Celular: atalhos roláveis */}
      <nav aria-label="Seções das configurações" className="-mx-4 mb-2 overflow-x-auto px-4 lg:hidden">
        <ul className="flex w-max gap-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block whitespace-nowrap rounded-full bg-night/70 px-3 py-1.5 text-sm text-steel ring-1 ring-rime hover:text-silver"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
