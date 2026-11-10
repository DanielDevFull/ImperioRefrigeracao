import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/system/page-header";
import { toneOnTint } from "@/components/system/tone-badge";
import { requireStaff } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { formatDate, formatQuote } from "@/lib/format";
import { cn } from "@/lib/utils";
import { becomesOmMaterial, isQuoteOpen } from "@/server/core/quotes";
import { getSettings } from "@/server/settings";
import { ToastOnArrival } from "../../../estoque/_components/param-controls";
import { isUuid } from "../../../oms/_lib/constants";
import { QuoteForm } from "../../_components/quote-form";
import { getQuote, quoteCustomerOptions, quoteProductOptions } from "../../_lib/queries";

export async function generateMetadata({ params }: PageProps<"/admin/orcamentos/[id]/editar">): Promise<Metadata> {
  const { id } = await params;
  const q = isUuid(id) ? await getQuote(id) : null;
  return { title: q ? `Editar ${formatQuote(q.number)}` : "Editar orçamento" };
}

export default async function EditarOrcamentoPage({ params }: PageProps<"/admin/orcamentos/[id]/editar">) {
  await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const q = await getQuote(id);
  if (!q) notFound();
  if (!isQuoteOpen(q.status)) redirect(`/admin/orcamentos/${id}`);
  const today = todayISO();
  const [settings, customers, products] = await Promise.all([getSettings(), quoteCustomerOptions(), quoteProductOptions()]);
  const expired = q.validUntil < today;

  return (
    <>
      <ToastOnArrival param="copia" message="Cópia criada. Revise e salve." />
      <PageHeader
        title={`Editar ${formatQuote(q.number)}`}
        description={q.title}
        back={{ href: `/admin/orcamentos/${q.id}`, label: formatQuote(q.number) }}
      />
      {(expired || q.status === "enviado") && (
        <p
          className={cn(
            "mb-6 rounded-xl px-4 py-3 text-sm ring-1",
            expired ? `bg-brass/10 ring-brass/30 light:bg-notice-brass ${toneOnTint.brass}` : "bg-night/50 text-steel ring-rime",
          )}
        >
          {expired
            ? `Este orçamento venceu em ${formatDate(q.validUntil)}. Ajuste a validade para o cliente poder aprovar pelo link.`
            : "O cliente já recebeu o link: as mudanças aparecem para ele assim que você salvar."}
        </p>
      )}
      <QuoteForm
        initial={{
          id: q.id,
          customerId: q.customerId,
          contactName: q.contactName,
          contactPersonType: q.contactPersonType,
          contactDocument: q.contactDocument,
          contactPhone: q.contactPhone,
          contactEmail: q.contactEmail,
          zip: q.zip,
          street: q.street,
          addressNumber: q.addressNumber,
          complement: q.complement,
          district: q.district,
          city: q.city,
          state: q.state,
          workType: q.workType,
          title: q.title,
          description: q.description,
          discount: q.discount,
          validUntil: q.validUntil,
          terms: q.terms,
          // material cujo produto saiu do cadastro já conta como serviço
          items: q.items.map((i) => ({
            kind: becomesOmMaterial(i) ? "material" : "servico",
            productId: becomesOmMaterial(i) ? i.productId : null,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
          })),
        }}
        customers={customers}
        products={products}
        today={today}
        validityDays={settings.quoteValidityDays}
        cancelHref={`/admin/orcamentos/${q.id}`}
      />
    </>
  );
}
