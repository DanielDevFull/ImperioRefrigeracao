"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Coins, ScanLine, Sun, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { Emblem } from "@/components/brand/emblem";
import { cn } from "@/lib/utils";
import { isActive } from "./nav";

const items = [
  { href: "/tecnico", label: "Hoje", icon: Sun, exact: true },
  { href: "/tecnico/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/tecnico/escanear", label: "Escanear", icon: ScanLine, primary: true },
  { href: "/tecnico/ganhos", label: "Ganhos", icon: Coins },
  { href: "/tecnico/perfil", label: "Perfil", icon: UserRound },
];

/** App do técnico: cabeçalho compacto e barra inferior ao alcance do polegar. */
export function TechShell({ topbar, children }: { topbar: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const inOrder = pathname.startsWith("/tecnico/om/");
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b border-rime bg-abyss/80 px-4 backdrop-blur-xl [padding-top:env(safe-area-inset-top)]">
        <Link href="/tecnico" className="flex items-center gap-2">
          <Emblem size={30} />
          <span className="font-display text-silver-brushed text-[0.95rem] font-bold tracking-[0.06em]">Imperium</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">{topbar}</div>
      </header>
      <main className={cn("flex-1 px-4 pt-4", inOrder ? "pb-36" : "pb-28")}>{children}</main>
      {!inOrder && (
        <nav
          aria-label="Navegação do técnico"
          className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t border-rime bg-night/85 backdrop-blur-xl [padding-bottom:env(safe-area-inset-bottom)]"
        >
          <ul className="grid grid-cols-5">
            {items.map((it) => {
              const active = isActive(pathname, it);
              const Icon = it.icon;
              return (
                <li key={it.href} className="relative">
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem]",
                      active ? "text-silver" : "text-steel",
                    )}
                  >
                    {it.primary ? (
                      <span className="-mt-6 grid size-14 place-items-center rounded-full bg-gradient-to-b from-ice to-ice-deep text-abyss shadow-[0_8px_24px_-6px_rgb(56_168_255/0.7)] ring-4 ring-abyss">
                        <Icon className="size-6" />
                      </span>
                    ) : (
                      <span className="relative grid h-7 w-12 place-items-center">
                        {active && (
                          <motion.span
                            layoutId="tech-nav-active"
                            className="absolute inset-0 rounded-full bg-ice/15 ring-1 ring-ice/30"
                            transition={{ type: "spring", stiffness: 500, damping: 38 }}
                          />
                        )}
                        <Icon className={cn("relative size-5", active && "text-ice")} />
                      </span>
                    )}
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
