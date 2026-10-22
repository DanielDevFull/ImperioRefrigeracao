"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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

type ViewTransition = { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void };

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
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", pref === "system" ? "light dark" : pref);
}

function saveTheme(pref: ThemePref) {
  fetch("/api/tema", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tema: pref }),
    keepalive: true,
  }).catch(() => {
    // sem conexão: a troca vale nesta tela; volta a valer a anterior no próximo carregamento
  });
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

  // Toques rápidos (setas, cliques durante a animação): a última escolha sempre vence.
  const latest = useRef<ThemePref>(initial);
  const transition = useRef<ViewTransition | null>(null);
  const pendingSave = useRef<ThemePref | null>(null);
  const saveTimer = useRef<number | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (pendingSave.current) saveTheme(pendingSave.current);
    pendingSave.current = null;
  }, []);

  useEffect(() => {
    // sair da página antes do prazo ainda salva a escolha
    window.addEventListener("pagehide", flushSave);
    return () => {
      window.removeEventListener("pagehide", flushSave);
      flushSave();
    };
  }, [flushSave]);

  const setTheme = useCallback(
    (pref: ThemePref, origin?: { x: number; y: number }) => {
      const root = document.documentElement;
      const before = root.classList.contains("light") ? "light" : root.classList.contains("dark") ? "dark" : systemTheme();
      const after = pref === "system" ? systemTheme() : pref;
      latest.current = pref;
      const swap = () => {
        const p = latest.current;
        flushSync(() => setThemeState(p));
        applyClass(p);
        applyThemeColor(p);
      };

      // uma troca ainda animando termina na hora; a nova começa do estado já trocado
      transition.current?.skipTransition();

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const doc = document as Document & { startViewTransition?: (cb: () => void) => ViewTransition };
      if (before === after || reduced || !doc.startViewTransition) {
        swap();
      } else {
        root.classList.add("theme-switching");
        const x = origin?.x ?? window.innerWidth / 2;
        const y = origin?.y ?? 0;
        const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
        const vt = doc.startViewTransition(swap);
        transition.current = vt;
        vt.ready
          .then(() =>
            root.animate(
              { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
              { duration: 560, easing: "cubic-bezier(0.22, 0.8, 0.24, 1)", pseudoElement: "::view-transition-new(root)" },
            ),
          )
          .catch(() => {});
        vt.finished.finally(() => {
          if (transition.current !== vt) return;
          transition.current = null;
          root.classList.remove("theme-switching");
        });
      }

      // grava só a última escolha, um instante depois (pedidos fora de ordem não desfazem a troca)
      pendingSave.current = pref;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flushSave, 400);
    },
    [flushSave],
  );

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
