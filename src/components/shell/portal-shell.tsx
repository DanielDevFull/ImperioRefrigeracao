"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AirVent, ClipboardList, Home, ShieldCheck, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { Emblem, Wordmark } from "@/components/brand/emblem";
import { cn } from "@/lib/utils";
import { isActive } from "./nav";

const items = [
  { href: "/portal", label: "Início", icon: Home, exact: true },
  { href: "/portal/equipamentos", label: "Equipamentos", icon: AirVent },
  { href: "/portal/mensalidades", label: "Mensalidades", icon: Wallet },
  { href: "/portal/atendimentos", label: "Atendimentos", icon: ClipboardList },
  { href: "/portal/pmoc", label: "PMOC", icon: ShieldCheck },
];

export function PortalShell({ topbar, children }: { topbar: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-rime bg-abyss/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-6">
          <Link href="/portal" className="flex items-center gap-3">
            <Emblem size={38} />
            <Wordmark className="hidden sm:flex" />
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Portal do cliente">
            {items.map((it) => {
              const active = isActive(pathname, it);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative rounded-full px-3.5 py-1.5 text-sm transition-colors", active ? "text-silver" : "text-steel hover:text-silver")}
                >
                  {active && (
                    <motion.span
                      layoutId="portal-nav-active"
                      className="absolute inset-0 rounded-full bg-ice/12 ring-1 ring-ice/25"
                      transition={{ type: "spring", stiffness: 450, damping: 36 }}
                    />
                  )}
                  <span className="relative">{it.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">{topbar}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-6 md:pb-12 md:pt-8">{children}</main>
      <nav
        aria-label="Portal do cliente"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-rime bg-night/85 backdrop-blur-xl [padding-bottom:env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {items.map((it) => {
            const active = isActive(pathname, it);
            const Icon = it.icon;
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[0.68rem]", active ? "text-silver" : "text-steel")}
                >
                  <Icon className={cn("size-5", active && "text-ice")} />
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
