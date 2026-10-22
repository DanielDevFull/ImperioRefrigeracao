"use client";

import { MonitorSmartphone, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { themeLabel, type ThemePref } from "@/lib/theme";
import { useTheme } from "./theme-provider";

const ICON: Record<ThemePref, typeof Sun> = { light: Sun, dark: Moon, system: MonitorSmartphone };
const ORDER: ThemePref[] = ["light", "dark", "system"];

function centerOf(el: Element | null) {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Controle segmentado Claro / Escuro / Automático (perfil do técnico, configurações). */
export function ThemeSegmented({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cn("relative grid grid-cols-3 gap-1 rounded-xl bg-glacier/70 p-1 ring-1 ring-rime", className)}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        // parte do botão focado (o estado do React pode estar um passo atrás em toques rápidos)
        const current = (e.target as HTMLElement).closest<HTMLElement>("[data-value]")?.dataset.value as ThemePref | undefined;
        const next = ORDER[(ORDER.indexOf(current ?? theme) + step + ORDER.length) % ORDER.length];
        const btn = e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`);
        btn?.focus();
        setTheme(next, centerOf(btn));
      }}
    >
      {ORDER.map((pref) => {
        const Icon = ICON[pref];
        const active = theme === pref;
        return (
          <button
            key={pref}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={pref}
            onClick={(e) => !active && setTheme(pref, centerOf(e.currentTarget))}
            className={cn(
              "relative flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              // md: alvo de toque de 44px (app de campo); em telas estreitas o ícone sai para o rótulo caber
              size === "sm" ? "h-8 text-xs" : "h-11 text-sm max-[380px]:[&>svg]:hidden",
              active ? "text-silver" : "text-steel hover:text-silver",
            )}
          >
            {active && (
              <motion.span
                layoutId="theme-segment"
                className="absolute inset-0 rounded-lg bg-night shadow-[0_1px_2px_var(--shade),0_6px_16px_-10px_var(--shade-strong)] ring-1 ring-rime"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            {/* z-10: a pílula que desliza nunca cobre o rótulo do botão por onde passa */}
            <Icon className="relative z-10 size-4" aria-hidden />
            <span className="relative z-10">{themeLabel[pref]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Opções de tema dentro de um menu suspenso (menu do usuário). O menu continua aberto ao trocar. */
export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-steel">Tema</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme}>
        {ORDER.map((pref) => {
          const Icon = ICON[pref];
          return (
            <DropdownMenuRadioItem
              key={pref}
              value={pref}
              onSelect={(e) => {
                e.preventDefault();
                if (pref !== theme) setTheme(pref, centerOf(e.currentTarget as Element));
              }}
            >
              <Icon className="size-4 text-steel" aria-hidden />
              {themeLabel[pref]}
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </>
  );
}
