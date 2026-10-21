import "server-only";
import type { receivables } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { formatCompetence } from "@/lib/format";
import { effectiveFinanceStatus } from "@/lib/labels";
import { buildPixPayload, txidFor } from "@/lib/pix";
import { amountDueToday } from "@/server/billing";
import type { Settings } from "@/server/settings";
import { capitalize } from "./copy";
import { contactLink } from "./data";

type Receivable = typeof receivables.$inferSelect;

export type PayData = {
  id: string;
  status: "aberto" | "vencido" | "em_analise";
  title: string;
  description: string;
  dueDate: string;
  base: number;
  fine: number;
  interest: number;
  total: number;
  daysLate: number;
  finePercent: number;
  interestPercent: number;
  pixCode: string | null;
  merchantName: string;
  whatsappHref: string | null;
  proofSentAt: string | null;
  proofUrl: string | null;
};

export function receivableTitle(rec: Pick<Receivable, "kind" | "competence" | "description">) {
  if (rec.kind === "mensalidade" && rec.competence) return `Mensalidade de ${formatCompetence(rec.competence)}`;
  return rec.description;
}

export function receivableSubtitle(rec: Pick<Receivable, "kind" | "competence" | "description">) {
  if (rec.kind === "mensalidade" && rec.competence) {
    const rest = rec.description.replace(/^Mensalidade\s+/, "");
    const cut = rest.lastIndexOf(" — ");
    return (cut > 0 ? rest.slice(0, cut) : rest) || "Plano de manutenção";
  }
  return rec.kind === "servico" ? "Serviço avulso" : "Cobrança";
}

/** Dados do Pix para quitar hoje (com multa e juros quando vencida). */
export async function buildPayData(rec: Receivable, settings: Settings): Promise<PayData> {
  const today = todayISO();
  const late = await amountDueToday(rec, today);
  const merchantName = settings.pixMerchantName ?? settings.companyName;
  const title = receivableTitle(rec);
  const pixCode = settings.pixKey
    ? buildPixPayload({
        key: settings.pixKey,
        merchantName,
        merchantCity: settings.pixMerchantCity ?? settings.city ?? "Sao Paulo",
        amount: late.total,
        txid: rec.pixTxid ?? txidFor(rec.id),
        description: rec.kind === "mensalidade" && rec.competence ? `Mensalidade ${rec.competence}` : title,
      })
    : null;
  const eff = effectiveFinanceStatus(rec.status, rec.dueDate, today);
  return {
    id: rec.id,
    status: eff === "em_analise" ? "em_analise" : eff === "vencido" ? "vencido" : "aberto",
    title: capitalize(title),
    description: receivableSubtitle(rec),
    dueDate: rec.dueDate,
    base: Math.round((rec.amount - (rec.discount ?? 0)) * 100) / 100,
    fine: late.fine,
    interest: late.interest,
    total: late.total,
    daysLate: late.daysLate,
    finePercent: settings.lateFinePercent,
    interestPercent: settings.lateInterestMonthlyPercent,
    pixCode,
    merchantName: settings.companyName,
    whatsappHref: contactLink(settings, `Olá! Quero pagar: ${title}.`),
    proofSentAt: rec.proofSentAt ? rec.proofSentAt.toISOString() : null,
    proofUrl: rec.proofUrl,
  };
}
