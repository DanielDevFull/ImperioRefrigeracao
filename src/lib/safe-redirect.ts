/** Aceita só caminhos internos ("/admin/oms"), nunca "//site.com" ou URLs absolutas. */
export function safeInternalPath(value: string | null | undefined): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return undefined;
  if (/[\u0000-\u001f]/.test(value)) return undefined;
  return value;
}
