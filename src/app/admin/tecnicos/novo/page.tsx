import type { Metadata } from "next";
import { PageHeader } from "@/components/system/page-header";
import { TechnicianForm } from "../_components/technician-form";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Novo técnico" };

export default async function NovoTecnicoPage() {
  await requireStaff();
  return (
    <>
      <PageHeader
        title="Novo técnico"
        description="Cadastre o técnico e, se quiser, já crie o acesso ao app e o estoque do veículo."
        back={{ href: "/admin/tecnicos", label: "Técnicos" }}
      />
      <TechnicianForm />
    </>
  );
}
