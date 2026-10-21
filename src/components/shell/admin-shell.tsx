"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { motion } from "motion/react";
import { Emblem, Wordmark } from "@/components/brand/emblem";
import { SnowField } from "@/components/brand/snow-field";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { adminNav, isActive } from "./nav";

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6" aria-label="Navegação principal">
      {adminNav.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-2 text-[0.72rem] font-medium text-steel/70">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href} className="relative">
                  {active && (
                    <motion.span
                      layoutId="admin-nav-active"
                      className="absolute inset-0 rounded-lg bg-gradient-to-r from-ice/18 to-ice/5 ring-1 ring-ice/25"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active ? "text-silver" : "text-steel hover:bg-ice/5 hover:text-silver",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-ice" : "text-steel/80")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="relative flex items-center gap-3 overflow-hidden px-5 pb-6 pt-6">
      <SnowField density="whisper" interactive={false} crystals={false} className="opacity-70" />
      <Emblem size={44} halo />
      <Wordmark />
    </Link>
  );
}

export function AdminShell({ topbar, children }: { topbar: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:pl-[17rem]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[17rem] flex-col border-r border-rime bg-sidebar backdrop-blur-xl lg:flex">
        <Brand />
        <SidebarNav />
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-rime bg-abyss/70 px-4 backdrop-blur-xl md:px-8">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="grid size-10 place-items-center rounded-lg text-steel hover:bg-ice/10 hover:text-frost lg:hidden" aria-label="Abrir menu">
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="flex w-[17rem] flex-col border-rime bg-night p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Brand />
            <SidebarNav onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <Link href="/admin" className="flex items-center gap-2 lg:hidden">
          <Emblem size={30} />
          <span className="font-display text-silver-brushed text-base font-bold tracking-[0.06em]">Imperium</span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">{topbar}</div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
