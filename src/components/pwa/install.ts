"use client";

import { useSyncExternalStore } from "react";

/** Evento `beforeinstallprompt` (Chrome/Edge/Android). Não existe no iOS. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = {
  /** o navegador ofereceu instalar (podemos mostrar o botão) */
  canPrompt: boolean;
  /** já está aberto como app instalado */
  installed: boolean;
  ios: boolean;
};

let deferred: InstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, installed: false, ios: false };
const SERVER: InstallState = state;
const listeners = new Set<() => void>();
let started = false;

function set(patch: Partial<InstallState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

/** Começa a escutar o convite de instalação (chamar cedo, no layout). */
export function captureInstallPrompt() {
  if (started || typeof window === "undefined") return;
  started = true;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  set({ installed: Boolean(standalone), ios });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });
}

/** Abre o convite nativo de instalação. Devolve true se a pessoa aceitou. */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  set({ canPrompt: false });
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  if (choice.outcome === "accepted") set({ installed: true });
  return choice.outcome === "accepted";
}

export function useInstallPrompt() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      captureInstallPrompt();
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
    () => SERVER,
  );
}
