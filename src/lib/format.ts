import { TZ } from "./dates";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export function formatBRL(value: number | string | null | undefined) {
  return brl.format(Number(value ?? 0));
}

export function formatBRLCompact(value: number | string | null | undefined) {
  return brlCompact.format(Number(value ?? 0));
}

export function formatNumber(value: number | string | null | undefined) {
  return num.format(Number(value ?? 0));
}

/** 0.256 → "25,6%" */
export function formatPercent(ratio: number) {
  return pct.format(Number.isFinite(ratio) ? ratio : 0);
}

/** Converte "YYYY-MM-DD" (date do Postgres) em Date ao meio-dia UTC, evitando troca de dia por fuso. */
export function parseISODate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function toDate(value: Date | string) {
  if (value instanceof Date) return value;
  return value.length === 10 ? parseISODate(value) : new Date(value);
}

/** 21/10/2026 */
export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short" }).format(
    toDate(value),
  );
}

/** 21 de out. */
export function formatDayMonth(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "numeric", month: "short" }).format(
    toDate(value),
  );
}

/** quarta-feira, 21 de outubro */
export function formatLongDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(toDate(value));
}

/** 21/10/2026 14:32 */
export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(toDate(value));
}

/** 14:32 */
export function formatTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, timeStyle: "short" }).format(
    toDate(value),
  );
}

/** "2026-10" → "outubro de 2026" */
export function formatCompetence(competence: string | null | undefined) {
  if (!competence) return "—";
  const [y, m] = competence.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 15)),
  );
}

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
export function formatRelative(value: Date | string) {
  const d = toDate(value);
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
  return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
}

export const onlyDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/**
 * CPF/CNPJ sem pontuação e em maiúsculas. Mantém letras porque o CNPJ alfanumérico
 * (IN RFB 2.229/2024, emitido desde julho de 2026) tem 12 caracteres [0-9A-Z] + 2 dígitos verificadores.
 */
export const normalizeDocument = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

/** 123.456.789-09 (CPF) ou 12.ABC.345/01DE-35 (CNPJ numérico ou alfanumérico). */
export function formatDocument(value: string | null | undefined) {
  const d = normalizeDocument(value);
  if (/^\d{11}$/.test(d)) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (/^[0-9A-Z]{12}\d{2}$/.test(d)) return d.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, "$1.$2.$3/$4-$5");
  return value ?? "—";
}

/**
 * Telefone só com dígitos (DDD + número). Tira o código do país quando o número veio
 * no formato internacional (+55 11 98765-4321 → 11987654321).
 */
export function normalizePhone(value: string | null | undefined) {
  const d = onlyDigits(value);
  return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d;
}

export function formatPhone(value: string | null | undefined) {
  const d = normalizePhone(value);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value ?? "—";
}

export function formatCEP(value: string | null | undefined) {
  const d = onlyDigits(value);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : (value ?? "");
}

export const formatOM = (n: number | null | undefined) => `OM-${String(n ?? 0).padStart(6, "0")}`;
export const formatPO = (n: number | null | undefined) => `PC-${String(n ?? 0).padStart(5, "0")}`;
export const formatCustomerCode = (n: number | null | undefined) =>
  `CLI-${String(n ?? 0).padStart(4, "0")}`;
export const formatEquipmentCode = (n: number | null | undefined) =>
  `EQ-${String(n ?? 0).padStart(5, "0")}`;
export const formatContractCode = (n: number | null | undefined) =>
  `CT-${String(n ?? 0).padStart(4, "0")}`;

export function formatBTU(btu: number | null | undefined) {
  if (!btu) return "—";
  return `${new Intl.NumberFormat("pt-BR").format(btu)} BTU/h`;
}

export function whatsappLink(phone: string | null | undefined, text?: string) {
  const d = onlyDigits(phone);
  if (!d) return null;
  // DDD + número (10–11 dígitos) ganha o 55; com 12–13 dígitos o código do país já está lá.
  // Não dá para usar startsWith("55"): 55 também é DDD (RS).
  const full = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function initials(name: string | null | undefined) {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function addressLine(site: {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
} | null | undefined) {
  if (!site) return "";
  const first = [site.street, site.number].filter(Boolean).join(", ");
  const parts = [first, site.complement, site.district, [site.city, site.state].filter(Boolean).join("/")];
  return parts.filter(Boolean).join(", ");
}

export function mapsLink(site: Parameters<typeof addressLine>[0] & { lat?: number | null; lng?: number | null }) {
  if (!site) return null;
  if (site.lat != null && site.lng != null)
    return `https://www.google.com/maps/dir/?api=1&destination=${site.lat},${site.lng}`;
  const q = addressLine(site);
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null;
}
