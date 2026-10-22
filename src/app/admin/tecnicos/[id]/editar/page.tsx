import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/system/page-header";
import { TechnicianForm } from "../../_components/technician-form";
import { getTechnician } from "../../_lib/queries";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Editar técnico" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarTecnicoPage({ params }: PageProps<"/admin/tecnicos/[id]/editar">) {
  await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTechnician(id);
  if (!t) notFound();
  return (
    <>
      <PageHeader
        title="Editar técnico"
        description={t.name}
        back={{ href: `/admin/tecnicos/${t.id}`, label: t.name }}
      />
      <TechnicianForm
        technician={{
          id: t.id,
          name: t.name,
          phone: t.phone,
          email: t.email,
          document: t.document,
          color: t.color,
          skills: t.skills,
          vehiclePlate: t.vehiclePlate,
          admissionDate: t.admissionDate,
          notes: t.notes,
        }}
      />
    </>
  );
}
