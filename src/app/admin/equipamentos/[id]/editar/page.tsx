import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/system/page-header";
import { formatEquipmentCode } from "@/lib/format";
import { EquipmentForm } from "../../_components/equipment-form";
import { customerOptions, equipmentTypeOptions, getEquipmentForEdit, sitesOf } from "../../_lib/queries";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Editar equipamento" };

export default async function EditarEquipamentoPage({ params }: PageProps<"/admin/equipamentos/[id]/editar">) {
  await requireStaff();
  const { id } = await params;
  const item = await getEquipmentForEdit(id);
  if (!item) notFound();
  const [customers, types, sites] = await Promise.all([customerOptions(), equipmentTypeOptions(), sitesOf(item.customerId)]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Editar equipamento"
        description={`${formatEquipmentCode(item.code)}${item.location ? `, ${item.location}` : ""}. Para retirar o aparelho de operação, use “Marcar como removido” na ficha.`}
        back={{ href: `/admin/equipamentos/${item.id}`, label: formatEquipmentCode(item.code) }}
      />
      <EquipmentForm
        customers={customers
          .filter((c) => c.status === "ativo" || c.id === item.customerId)
          .map((c) => ({ id: c.id, label: c.tradeName || c.name, inactive: c.status === "inativo" }))}
        types={types}
        initialSites={sites}
        initial={{
          id: item.id,
          customerId: item.customerId,
          siteId: item.siteId,
          typeId: item.typeId,
          brand: item.brand,
          model: item.model,
          serialNumber: item.serialNumber,
          capacityBtu: item.capacityBtu,
          refrigerant: item.refrigerant,
          voltage: item.voltage,
          location: item.location,
          installDate: item.installDate,
          warrantyUntil: item.warrantyUntil,
          status: item.status,
          notes: item.notes,
          photoUrl: item.photoUrl,
        }}
      />
    </div>
  );
}
