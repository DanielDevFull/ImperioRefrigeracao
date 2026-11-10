import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { formatQuote } from "@/lib/format";
import { effectiveQuoteStatus, isQuoteOpen } from "@/server/core/quotes";
import { getSettings } from "@/server/settings";
import { PrintButton } from "../../../compras/pedidos/[id]/_components/print-button";
import { isUuid } from "../../../oms/_lib/constants";
import { SendWhatsappButton } from "../../_components/quote-actions";
import { QuoteDocument } from "../../_components/quote-document";
import { quotePublicUrl, quoteWhatsappLink } from "../../_lib/link";
import { getQuote } from "../../_lib/queries";

export async function generateMetadata({ params }: PageProps<"/admin/orcamentos/[id]/imprimir">): Promise<Metadata> {
  const { id } = await params;
  const q = isUuid(id) ? await getQuote(id) : null;
  return { title: q ? `Imprimir ${formatQuote(q.number)}` : "Imprimir orçamento" };
}

/** Versão para impressão / PDF, com QR para o cliente aprovar pelo celular. */
export default async function ImprimirOrcamentoPage({ params }: PageProps<"/admin/orcamentos/[id]/imprimir">) {
  await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [q, settings] = await Promise.all([getQuote(id), getSettings()]);
  if (!q) notFound();
  const status = effectiveQuoteStatus(q.status, q.validUntil, todayISO());
  const wa = isQuoteOpen(q.status) ? quoteWhatsappLink(q, settings.companyName) : null;

  return (
    <>
      {/* Na impressão, só a folha aparece (o menu e a barra do sistema somem) */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body * { visibility: hidden !important; }
          #quote-sheet, #quote-sheet * { visibility: visible !important; }
          #quote-sheet { position: absolute; left: 0; top: 0; width: 100%; max-width: none; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; }
        }
      `}</style>

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/admin/orcamentos/${q.id}`}
          className="inline-flex items-center gap-1 text-sm text-steel transition-colors hover:text-frost"
        >
          <ChevronLeft className="size-4" />
          Voltar ao orçamento
        </Link>
        <div className="flex flex-wrap gap-2">
          {wa && <SendWhatsappButton quoteId={q.id} href={wa} variant="outline" />}
          <PrintButton label="Imprimir orçamento" />
        </div>
      </div>

      <QuoteDocument quote={q} company={settings} status={status} publicUrl={quotePublicUrl(q.publicToken)} />
    </>
  );
}
