import type { Metadata } from "next";
import { PageHeader } from "@/components/system/page-header";
import { param } from "@/lib/params";
import { EquipmentForm } from "../_components/equipment-form";
import { customerOptions, equipmentTypeOptions, isUuid, sitesOf } from "../_lib/queries";

export const metadata: Metadata = { title: "Novo equipamento" };

export default async function NovoEquipamentoPage({ searchParams }: PageProps<"/admin/equipamentos/novo">) {
  const sp = await searchParams;
  const requested = param(sp, "customerId");
  const [customers, types] = await Promise.all([customerOptions(), equipmentTypeOptions()]);
  const preset = isUuid(requested) && customers.some((c) => c.id === requested) ? requested : undefined;
  const sites = preset ? await sitesOf(preset) : [];
  const presetCustomer = customers.find((c) => c.id === preset);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Novo equipamento"
        description={
          presetCustomer
            ? `Aparelho de ${presetCustomer.tradeName || presetCustomer.name}. O QR da etiqueta é criado ao salvar.`
            : "Cadastre o aparelho para planejar as visitas e imprimir a etiqueta QR."
        }
        back={
          presetCustomer
            ? { href: `/admin/clientes/${presetCustomer.id}?tab=equipamentos`, label: presetCustomer.tradeName || presetCustomer.name }
            : { href: "/admin/equipamentos", label: "Equipamentos" }
        }
      />
      <EquipmentForm
        customers={customers
          .filter((c) => c.status === "ativo" || c.id === preset)
          .map((c) => ({ id: c.id, label: c.tradeName || c.name, inactive: c.status === "inativo" }))}
        types={types}
        initialSites={sites}
        defaultCustomerId={preset}
      />
    </div>
  );
}
