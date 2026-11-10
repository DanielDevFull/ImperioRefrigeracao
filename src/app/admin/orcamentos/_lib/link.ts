import { formatBRL, formatDate, formatQuote, whatsappLink } from "@/lib/format";

/** Endereço do sistema: o configurado ou, na falta dele, o domínio de produção do Vercel. */
function appBase() {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "";
}

/** Endereço público do orçamento (o cliente vê, aprova ou recusa sem login). */
export function quotePublicUrl(token: string) {
  return `${appBase()}/orcamento/${token}`;
}

/** Mensagem pronta para o WhatsApp do cliente, com o link para aprovar. */
export function quoteWhatsappMessage(
  q: { number: number; contactName: string; title: string; total: number; validUntil: string; publicToken: string },
  companyName: string,
) {
  const first = q.contactName.trim().split(/\s+/)[0];
  return [
    `Olá${first ? `, ${first}` : ""}! Aqui é da ${companyName}.`,
    `Segue o orçamento ${formatQuote(q.number)}: ${q.title}.`,
    `Total: ${formatBRL(q.total)}, válido até ${formatDate(q.validUntil)}.`,
    `Veja os detalhes e aprove por aqui: ${quotePublicUrl(q.publicToken)}`,
  ].join("\n");
}

export function quoteWhatsappLink(
  q: Parameters<typeof quoteWhatsappMessage>[0] & { contactPhone: string | null },
  companyName: string,
) {
  return whatsappLink(q.contactPhone, quoteWhatsappMessage(q, companyName));
}
