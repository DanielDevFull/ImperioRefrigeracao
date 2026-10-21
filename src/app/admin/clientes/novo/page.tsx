import type { Metadata } from "next";
import { PageHeader } from "@/components/system/page-header";
import { CustomerForm } from "../_components/customer-form";
import { activeTechnicians } from "../_lib/queries";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NovoClientePage() {
  const technicians = await activeTechnicians();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Novo cliente"
        description="Dados de identificação, contato e o primeiro local de atendimento."
        back={{ href: "/admin/clientes", label: "Clientes" }}
      />
      <CustomerForm technicians={technicians} />
    </div>
  );
}
