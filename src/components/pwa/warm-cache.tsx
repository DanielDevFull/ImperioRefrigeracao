"use client";

import { useEffect } from "react";

/** Pede ao service worker para guardar estas páginas (ex.: OMs de hoje) para uso offline. */
export function WarmOfflineCache({ urls }: { urls: string[] }) {
  const key = urls.join("|");
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !urls.length) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => {
        if (!cancelled) reg.active?.postMessage({ type: "warm", urls });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
