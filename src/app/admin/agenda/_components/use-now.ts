"use client";

import { useSyncExternalStore } from "react";
import { TZ, todayISO } from "@/lib/dates";

const subscribe = (cb: () => void) => {
  const t = setInterval(cb, 15_000);
  return () => clearInterval(t);
};
const getMinute = () => Math.floor(Date.now() / 60_000);
const getServerMinute = () => null;

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Hora atual em São Paulo, atualizada a cada minuto (null na renderização do servidor). */
export function useNow() {
  const minute = useSyncExternalStore(subscribe, getMinute, getServerMinute);
  if (minute == null) return null;
  const d = new Date(minute * 60_000);
  const parts = timeFmt.formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { today: todayISO(d), minutes: h * 60 + m, label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}
