"use client";

import { useEffect } from "react";
import { captureInstallPrompt } from "./install";

export function RegisterServiceWorker() {
  useEffect(() => {
    // o convite de instalação chega uma vez só, cedo: guarda para a tela de Perfil
    captureInstallPrompt();
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
