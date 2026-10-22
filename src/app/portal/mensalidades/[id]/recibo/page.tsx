import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { receivables } from "@/db/schema";
import { Emblem } from "@/components/brand/emblem";
import { PageHeader } from "@/components/system/page-header";
import { requireCustomer } from "@/lib/auth/session";
import { TZ } from "@/lib/dates";
import { formatBRL, formatCompetence, formatDate, formatDocument, formatPhone } from "@/lib/format";
import { labelOf, paymentMethod } from "@/lib/labels";
import { txidFor } from "@/lib/pix";
import { getSettings } from "@/server/settings";
import { PrintButton } from "../../../_components/print-tools";
import { isUuid } from "../../../_lib/copy";

export const metadata: Metadata = { title: "Recibo" };

const printCss = `
@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden !important; }
  #recibo, #recibo * { visibility: visible !important; }
  #recibo { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; }
}`;

export default async function ReciboPage({ params }: PageProps<"/portal/mensalidades/[id]/recibo">) {
  const { customer } = await requireCustomer();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const rec = await db.query.receivables.findFirst({
    where: and(eq(receivables.id, id), eq(receivables.customerId, customer.id), eq(receivables.status, "pago")),
  });
  if (!rec) notFound();
  const s = await getSettings();

  const paidOn = rec.paidAt ?? new Date();
  const base = rec.amount - rec.discount;
  const total = rec.paidAmount ?? base + rec.fine + rec.interest;
  const number = (rec.pixTxid ?? txidFor(rec.id)).slice(-10);
  const lines: { label: string; value: string }[] = [
    { label: "Valor da cobrança", value: formatBRL(rec.amount) },
    ...(rec.discount ? [{ label: "Desconto", value: `− ${formatBRL(rec.discount)}` }] : []),
    ...(rec.fine ? [{ label: "Multa por atraso", value: formatBRL(rec.fine) }] : []),
    ...(rec.interest ? [{ label: "Juros", value: formatBRL(rec.interest) }] : []),
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <style>{printCss}</style>
      <PageHeader
        back={{ href: "/portal/mensalidades", label: "Mensalidades" }}
        title="Recibo"
        description="Comprovante de pagamento emitido pela Imperium."
        actions={<PrintButton label="Imprimir recibo" variant="default" className="h-10 px-4" />}
      />

      <article
        id="recibo"
        className="rounded-2xl bg-white px-6 py-8 text-[#0a1428] shadow-[0_30px_60px_-30px_rgb(56_168_255/0.5)] sm:px-10 sm:py-10"
      >
        <header className="flex flex-col-reverse gap-5 border-b border-[#d8e1ee] pb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3">
            <Emblem size={52} />
            <div>
              <p className="font-display text-base font-bold tracking-[0.06em] sm:text-lg">{s.companyName}</p>
              {s.document && <p className="text-xs text-[#3a4a66]">CNPJ {formatDocument(s.document)}</p>}
              {s.address && <p className="text-xs text-[#3a4a66]">{s.address}</p>}
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
            <p className="font-display text-xl font-semibold tracking-[0.04em]">Recibo</p>
            <p className="font-mono text-xs text-[#3a4a66]">Nº {number}</p>
          </div>
        </header>

        <p className="mt-6 text-[0.95rem] leading-relaxed">
          Recebemos de <strong>{customer.name}</strong>
          {customer.document ? `, ${customer.document.length > 11 ? "CNPJ" : "CPF"} ${formatDocument(customer.document)},` : ""} a importância de{" "}
          <strong className="tabular-nums">{formatBRL(total)}</strong>{" "}
          {rec.kind === "mensalidade" && rec.competence
            ? `referente à mensalidade de ${formatCompetence(rec.competence)}`
            : `referente a ${rec.description}`}
          .
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[#5b6b86]">Vencimento</dt>
            <dd className="tabular-nums">{formatDate(rec.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#5b6b86]">Pago em</dt>
            <dd className="tabular-nums">{formatDate(paidOn)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#5b6b86]">Forma de pagamento</dt>
            <dd>{rec.paymentMethod ? labelOf(paymentMethod, rec.paymentMethod).label : "Pix"}</dd>
          </div>
        </dl>

        <dl className="mt-6 space-y-2 border-t border-[#d8e1ee] pt-4 text-sm">
          {lines.map((l) => (
            <div key={l.label} className="flex justify-between gap-4">
              <dt className="text-[#3a4a66]">{l.label}</dt>
              <dd className="tabular-nums">{l.value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-[#d8e1ee] pt-2 text-base font-semibold">
            <dt>Total pago</dt>
            <dd className="tabular-nums">{formatBRL(total)}</dd>
          </div>
        </dl>

        <footer className="mt-10 flex flex-col gap-1 text-sm">
          <p>
            {s.city ?? "São Paulo"}, {new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "long" }).format(paidOn)}.
          </p>
          <div className="mt-8 w-64 max-w-full border-t border-[#0a1428] pt-1.5 text-xs text-[#3a4a66]">
            {s.companyName}
          </div>
          {(s.phone || s.email) && (
            <p className="mt-4 flex flex-wrap gap-x-4 text-xs text-[#5b6b86]">
              {s.phone && <span>{formatPhone(s.phone)}</span>}
              {s.email && <span>{s.email}</span>}
            </p>
          )}
        </footer>
      </article>
    </div>
  );
}
