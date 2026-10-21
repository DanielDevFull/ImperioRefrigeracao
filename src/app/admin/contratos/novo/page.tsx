import type { Metadata } from "next";
import { PageHeader } from "@/components/system/page-header";
import { todayISO } from "@/lib/dates";
import { param } from "@/lib/params";
import { getSettings } from "@/server/settings";
import { ContractForm } from "../_components/contract-form";
import {
  activePlansWithTasks,
  activeTechnicians,
  customerEquipmentWithCoverage,
  customerOptions,
  isUuid,
} from "../_lib/queries";

export const metadata: Metadata = { title: "Novo contrato" };

export default async function NovoContratoPage({ searchParams }: PageProps<"/admin/contratos/novo">) {
  const sp = await searchParams;
  const requested = param(sp, "customerId");
  const [customers, plans, technicians, settings] = await Promise.all([
    customerOptions(),
    activePlansWithTasks(),
    activeTechnicians(),
    getSettings(),
  ]);
  const customer = isUuid(requested) ? customers.find((c) => c.id === requested && c.status === "ativo") : undefined;
  const equipment = customer ? await customerEquipmentWithCoverage(customer.id) : [];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/contratos", label: "Contratos" }}
        title="Novo contrato"
        description="Escolha o cliente, o valor e os equipamentos cobertos. Ao criar, a primeira mensalidade e as OMs do próximo período saem na hora."
      />
      <ContractForm
        customers={customers}
        plans={plans}
        technicians={technicians}
        initialCustomerId={customer?.id ?? null}
        initialEquipment={equipment}
        today={todayISO()}
        invoiceLeadDays={settings.invoiceLeadDays}
        horizonDays={settings.workOrderHorizonDays}
      />
    </>
  );
}
