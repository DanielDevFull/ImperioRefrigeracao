import type { Metadata } from "next";
import { PageHeader } from "@/components/system/page-header";
import { requireStaff } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { param } from "@/lib/params";
import { getSettings } from "@/server/settings";
import { createPmoc } from "../actions";
import { PmocForm } from "../_components/pmoc-form";
import { pmocFormOptions } from "../_lib/form-data";
import { defaultValidUntil } from "../_lib/pmoc";

export const metadata: Metadata = { title: "Novo PMOC" };

export default async function NewPmocPage({ searchParams }: PageProps<"/admin/pmoc/novo">) {
  await requireStaff();
  const sp = await searchParams;
  const [settings, options] = await Promise.all([getSettings(), pmocFormOptions()]);

  const customerId = options.customers.some((c) => c.id === param(sp, "customerId")) ? param(sp, "customerId")! : "";
  const customerSites = options.sites.filter((s) => s.customerId === customerId);
  const requestedSite = param(sp, "siteId");
  const siteId = customerSites.some((s) => s.id === requestedSite)
    ? requestedSite!
    : ((customerSites.find((s) => s.isPrimary) ?? customerSites[0])?.id ?? "");
  const from = todayISO();

  return (
    <>
      <PageHeader
        title="Novo PMOC"
        description="O documento reúne os equipamentos do local que estão em plano PMOC, as rotinas de manutenção, o cronograma anual e o registro das OMs."
        back={{ href: "/admin/pmoc", label: "PMOC" }}
      />
      <PmocForm
        action={createPmoc}
        submitLabel="Criar PMOC"
        cancelHref="/admin/pmoc"
        customers={options.customers}
        sites={options.sites}
        initial={{
          customerId,
          siteId,
          responsibleName: settings.pmocResponsibleName ?? "",
          responsibleRegistry: settings.pmocResponsibleRegistry ?? "",
          artNumber: settings.pmocResponsibleArt ?? "",
          validFrom: from,
          validUntil: defaultValidUntil(from),
          notes: "",
        }}
      />
    </>
  );
}
