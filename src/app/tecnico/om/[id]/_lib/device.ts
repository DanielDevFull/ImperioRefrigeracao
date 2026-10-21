"use client";

type Position = { lat: number; lng: number };
let cached: { pos: Position; at: number } | null = null;

/** Vibração curta quando o aparelho suporta (o iOS ignora). */
export function haptic(pattern: number | number[] = 10) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sem suporte */
  }
}

/**
 * Localização opcional para registrar o check-in/check-out.
 * Nunca trava o fluxo: devolve null se negar, demorar mais de `timeout` ou não houver GPS.
 */
export function getPosition(timeout = 8000): Promise<Position | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return Promise.resolve(null);
  if (cached && Date.now() - cached.at < 120_000) return Promise.resolve(cached.pos);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (pos: Position | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pos) cached = { pos, at: Date.now() };
      resolve(pos);
    };
    const timer = setTimeout(() => finish(null), timeout + 300);
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => finish(null),
        { enableHighAccuracy: true, timeout, maximumAge: 60_000 },
      );
    } catch {
      finish(null);
    }
  });
}

/** Aquece a localização só se a permissão já foi dada (sem abrir pedido de permissão). */
export async function warmPosition() {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (status?.state === "granted") void getPosition();
  } catch {
    /* navegador sem Permissions API */
  }
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
