import Image from "next/image";
import { QrCode } from "@/components/system/qr-code";
import {
  addressLine,
  formatBRL,
  formatCEP,
  formatDate,
  formatDateTime,
  formatDocument,
  formatNumber,
  formatPhone,
  formatQuote,
} from "@/lib/format";
import { labelOf, workOrderType } from "@/lib/labels";
import { becomesOmMaterial, lineTotal, quoteTotals, type EffectiveQuoteStatus } from "@/server/core/quotes";

export type QuoteDocData = {
  number: number;
  title: string;
  description: string | null;
  workType: string;
  contactName: string;
  contactPersonType: "pf" | "pj";
  contactDocument: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  zip: string | null;
  street: string | null;
  addressNumber: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  discount: number;
  validUntil: string;
  terms: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  decidedByName: string | null;
  items: { id: string; kind: "servico" | "material"; productId: string | null; description: string; quantity: number; unit: string; unitPrice: number }[];
};

export type CompanyData = {
  companyName: string;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
};

const STAMP: Partial<Record<EffectiveQuoteStatus, { label: string; className: string }>> = {
  aprovado: { label: "Aprovado", className: "border-emerald-600 text-emerald-700" },
  recusado: { label: "Recusado", className: "border-rose-600 text-rose-700" },
  cancelado: { label: "Cancelado", className: "border-slate-500 text-slate-600" },
  vencido: { label: "Vencido", className: "border-amber-600 text-amber-700" },
};

/**
 * O orçamento como documento (papel branco nos dois temas e na impressão).
 * Usado na impressão da equipe e no link público do cliente.
 */
export async function QuoteDocument({
  quote,
  company,
  status,
  publicUrl,
  id = "quote-sheet",
}: {
  quote: QuoteDocData;
  company: CompanyData;
  status: EffectiveQuoteStatus;
  /** Com o link, o papel impresso ganha um QR para aprovar pelo celular */
  publicUrl?: string | null;
  id?: string;
}) {
  const totals = quoteTotals(quote.items, quote.discount);
  const services = quote.items.filter((i) => !becomesOmMaterial(i));
  const materials = quote.items.filter((i) => becomesOmMaterial(i));
  const companyAddress = [company.address, [company.city, company.state].filter(Boolean).join("/")].filter(Boolean).join(", ");
  const serviceAddress = addressLine({
    street: quote.street,
    number: quote.addressNumber,
    complement: quote.complement,
    district: quote.district,
    city: quote.city,
    state: quote.state,
  });
  const stamp = STAMP[status];
  const contactPhone = quote.contactPhone ? formatPhone(quote.contactPhone) : null;
  const showQr = publicUrl && (status === "rascunho" || status === "enviado");

  return (
    <article
      id={id}
      className="mx-auto max-w-[210mm] overflow-hidden rounded-xl bg-white p-6 text-[13px] leading-relaxed text-slate-800 shadow-2xl light:shadow-[0_25px_50px_-12px_var(--shade)] light:ring-1 light:ring-rime sm:p-10"
    >
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Image src="/brand/emblem-256.webp" alt="" width={56} height={56} className="rounded-full" />
          <div>
            <p className="text-lg font-semibold text-slate-900">{company.companyName}</p>
            {company.document && <p className="text-slate-500">CNPJ {formatDocument(company.document)}</p>}
            {companyAddress && <p className="text-slate-500">{companyAddress}</p>}
            {(company.whatsapp || company.phone) && <p className="text-slate-500">{formatPhone(company.whatsapp ?? company.phone)}</p>}
            {company.email && <p className="text-slate-500">{company.email}</p>}
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-sm text-slate-500">Orçamento</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatQuote(quote.number)}</p>
          <p className="text-slate-500">Emitido em {formatDate(quote.createdAt)}</p>
          <p className={status === "vencido" ? "font-medium text-amber-700" : "text-slate-500"}>Válido até {formatDate(quote.validUntil)}</p>
          {stamp && (
            <p className={`mt-3 inline-block -rotate-3 rounded-md border-2 px-3 py-0.5 text-sm font-semibold tracking-[0.12em] ${stamp.className}`}>
              {stamp.label}
            </p>
          )}
        </div>
      </header>

      <section className="grid gap-6 border-b border-slate-200 py-6 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Para</p>
          <p className="font-medium text-slate-900">{quote.contactName}</p>
          {quote.contactDocument && (
            <p>
              {quote.contactPersonType === "pj" ? "CNPJ" : "CPF"} {formatDocument(quote.contactDocument)}
            </p>
          )}
          {contactPhone && <p>{contactPhone}</p>}
          {quote.contactEmail && <p>{quote.contactEmail}</p>}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Local do serviço</p>
          {serviceAddress ? (
            <>
              <p>{serviceAddress}</p>
              {quote.zip && <p>CEP {formatCEP(quote.zip)}</p>}
            </>
          ) : (
            <p className="text-slate-500">A combinar</p>
          )}
        </div>
      </section>

      <section className="py-6">
        <p className="text-xs font-medium text-slate-500">{labelOf(workOrderType, quote.workType).label}</p>
        <h2 className="mt-0.5 text-base font-semibold text-slate-900">{quote.title}</h2>
        {quote.description && <p className="mt-2 whitespace-pre-line">{quote.description}</p>}
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs text-slate-500">
            <th className="py-2 pr-2 font-medium">Descrição</th>
            <th className="py-2 pr-2 text-right font-medium">Quantidade</th>
            <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">Unitário</th>
            <th className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {[
            { label: "Serviços", rows: services },
            { label: "Materiais", rows: materials },
          ]
            .filter((g) => g.rows.length)
            .map((g) => (
              <QuoteGroup key={g.label} label={g.label} rows={g.rows} showLabel={services.length > 0 && materials.length > 0} />
            ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 w-full max-w-72 space-y-1">
        {services.length > 0 && materials.length > 0 && (
          <>
            <div className="flex justify-between">
              <dt className="text-slate-500">Serviços</dt>
              <dd className="tabular-nums">{formatBRL(totals.services)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Materiais</dt>
              <dd className="tabular-nums">{formatBRL(totals.materials)}</dd>
            </div>
          </>
        )}
        {totals.discount > 0 && (
          <div className="flex justify-between">
            <dt className="text-slate-500">Desconto</dt>
            <dd className="tabular-nums">−{formatBRL(totals.discount)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-slate-300 pt-1.5 text-slate-900">
          <dt className="text-base font-semibold">Total</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatBRL(totals.total)}</dd>
        </div>
      </dl>

      {quote.terms && (
        <section className="mt-8 rounded-lg bg-slate-50 p-4">
          <p className="mb-1 text-xs font-medium text-slate-500">Condições</p>
          <p className="whitespace-pre-line">{quote.terms}</p>
        </section>
      )}

      {status === "aprovado" && quote.decidedAt && (
        <p className="mt-6 text-sm text-emerald-700">
          Aprovado em {formatDateTime(quote.decidedAt)}
          {quote.decidedByName ? ` por ${quote.decidedByName}` : ""}.
        </p>
      )}

      <footer className="mt-12 grid items-end gap-10 sm:grid-cols-[1fr_1fr_auto]">
        <div className="border-t border-slate-400 pt-2 text-center text-xs text-slate-500">
          {company.companyName}
          <br />
          Emitente
        </div>
        <div className="border-t border-slate-400 pt-2 text-center text-xs text-slate-500">
          {quote.contactName}
          <br />
          De acordo
        </div>
        {showQr && (
          <div className="hidden flex-col items-center gap-1 text-center text-[10px] text-slate-500 print:flex sm:flex">
            <QrCode value={publicUrl} size={84} />
            Aprove pelo celular
          </div>
        )}
      </footer>
    </article>
  );
}

function QuoteGroup({ label, rows, showLabel }: { label: string; rows: QuoteDocData["items"]; showLabel: boolean }) {
  return (
    <>
      {showLabel && (
        <tr>
          <td colSpan={4} className="pb-1 pt-4 text-xs font-medium text-slate-500">
            {label}
          </td>
        </tr>
      )}
      {rows.map((i) => (
        <tr key={i.id} className="border-b border-slate-100 align-top">
          <td className="py-2 pr-2 text-slate-900">
            {i.description}
            <span className="block text-xs text-slate-500 sm:hidden">{formatBRL(i.unitPrice)} cada</span>
          </td>
          <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums">
            {formatNumber(i.quantity)} {i.unit}
          </td>
          <td className="hidden whitespace-nowrap py-2 pr-2 text-right tabular-nums sm:table-cell">{formatBRL(i.unitPrice)}</td>
          <td className="whitespace-nowrap py-2 text-right tabular-nums">{formatBRL(lineTotal(i))}</td>
        </tr>
      ))}
    </>
  );
}
