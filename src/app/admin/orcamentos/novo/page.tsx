import type { Metadata } from "next";
import { PageHeader } from "@/components/system/page-header";
import { requireStaff } from "@/lib/auth/session";
import { addDays, todayISO } from "@/lib/dates";
import { param } from "@/lib/params";
import { getSettings } from "@/server/settings";
import { isUuid } from "../../oms/_lib/constants";
import { quoteCustomerAction } from "../actions";
import { QuoteForm, type QuoteFormInitial } from "../_components/quote-form";
import { DEFAULT_QUOTE_TERMS } from "../_lib/defaults";
import { quoteCustomerOptions, quoteProductOptions } from "../_lib/queries";

export const metadata: Metadata = { title: "Novo orçamento" };

export default async function NovoOrcamentoPage({ searchParams }: PageProps<"/admin/orcamentos/novo">) {
  await requireStaff();
  const sp = await searchParams;
  const customerParam = param(sp, "customerId");
  const today = todayISO();
  const [settings, customers, products] = await Promise.all([getSettings(), quoteCustomerOptions(), quoteProductOptions()]);

  // vindo da ficha do cliente: já preenche contato e endereço
  const customerId = isUuid(customerParam) && customers.some((c) => c.id === customerParam) ? customerParam : null;
  const c = customerId ? await quoteCustomerAction(customerId) : null;

  const initial: QuoteFormInitial = {
    customerId: c ? customerId : null,
    contactName: c?.name ?? "",
    contactPersonType: c?.personType ?? "pf",
    contactDocument: c?.document ?? null,
    contactPhone: c?.phone ?? null,
    contactEmail: c?.email ?? null,
    zip: c?.address?.zip ?? null,
    street: c?.address?.street ?? null,
    addressNumber: c?.address?.number ?? null,
    complement: c?.address?.complement ?? null,
    district: c?.address?.district ?? null,
    city: c?.address?.city ?? null,
    state: c?.address?.state ?? null,
    workType: "corretiva",
    title: "",
    description: null,
    discount: 0,
    validUntil: addDays(today, settings.quoteValidityDays),
    terms: settings.quoteTerms ?? DEFAULT_QUOTE_TERMS,
    items: [],
  };

  return (
    <>
      <PageHeader
        title="Novo orçamento"
        description="Monte e salve; depois envie o link pelo WhatsApp. O cliente aprova pelo celular e a OM é gerada sozinha."
        back={{ href: "/admin/orcamentos", label: "Orçamentos" }}
      />
      <QuoteForm
        initial={initial}
        customers={customers}
        products={products}
        today={today}
        validityDays={settings.quoteValidityDays}
        cancelHref="/admin/orcamentos"
      />
    </>
  );
}
