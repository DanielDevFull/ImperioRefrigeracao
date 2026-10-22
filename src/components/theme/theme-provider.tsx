"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { themeClass, themeColors, type ResolvedTheme, type ThemePref } from "@/lib/theme";

type ThemeContextValue = {
  /** Escolha do usuário (inclui "system"). */
  theme: ThemePref;
  /** Tema efetivamente na tela agora. */
  resolved: ResolvedTheme;
  /** Troca o tema; `origin` é o ponto (em px da janela) de onde o círculo da transição nasce. */
  setTheme: (pref: ThemePref, origin?: { x: number; y: number }) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function applyClass(pref: ThemePref) {
  const el = document.documentElement;
  el.classList.remove("light", "dark", "theme-system");
  el.classList.add(themeClass(pref));
}

/** Mantém a barra do navegador/PWA na cor do fundo do tema (só altera as metas que o servidor já criou). */
function applyThemeColor(pref: ThemePref) {
  const colors = themeColors(pref);
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    m.content = m.media.includes("dark") ? colors.dark : colors.light;
  }
}

export function ThemeProvider({ initial, children }: { initial: ThemePref; children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(initial);
  const system = useSyncExternalStore<ResolvedTheme>(subscribeSystem, systemTheme, () => "dark");

  // a preferência pode mudar no servidor (login de outra conta, router.refresh)
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setThemeState(initial);
  }

  const setTheme = useCallback((pref: ThemePref, origin?: { x: number; y: number }) => {
    const before = document.documentElement.classList.contains("light")
      ? "light"
      : document.documentElement.classList.contains("dark")
        ? "dark"
        : systemTheme();
    const after = pref === "system" ? systemTheme() : pref;
    const swap = () => {
      flushSync(() => setThemeState(pref));
      applyClass(pref);
      applyThemeColor(pref);
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
    if (before === after || reduced || !doc.startViewTransition) {
      swap();
    } else {
      const root = document.documentElement;
      root.classList.add("theme-switching");
      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? 0;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const vt = doc.startViewTransition(swap);
      vt.ready
        .then(() =>
          root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 560, easing: "cubic-bezier(0.22, 0.8, 0.24, 1)", pseudoElement: "::view-transition-new(root)" },
          ),
        )
        .catch(() => {});
      vt.finished.finally(() => root.classList.remove("theme-switching"));
    }

    fetch("/api/tema", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tema: pref }),
      keepalive: true,
    }).catch(() => {
      // sem conexão: a troca vale nesta tela; volta a valer a anterior no próximo carregamento
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolved: theme === "system" ? system : theme, setTheme }),
    [theme, system, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme precisa estar dentro de <ThemeProvider>.");
  return ctx;
}
