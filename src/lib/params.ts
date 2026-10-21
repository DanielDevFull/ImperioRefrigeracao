/** Utilitários para ler searchParams em Server Components. */
export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

export function pageFrom(sp: SearchParams) {
  const p = Number(param(sp, "page") ?? 1);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 1;
}

export const PAGE_SIZE = 25;
