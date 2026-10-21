import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pmocDocuments } from "@/db/schema";
import { PageHeader } from "@/components/system/page-header";
import { requireStaff } from "@/lib/auth/session";
import { updatePmoc } from "../../actions";
import { PmocForm } from "../../_components/pmoc-form";
import { pmocFormOptions } from "../../_lib/form-data";

export const metadata: Metadata = { title: "Editar PMOC" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EditPmocPage({ params }: PageProps<"/admin/pmoc/[id]/editar">) {
  await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [doc, options] = await Promise.all([
    db.query.pmocDocuments.findFirst({ where: eq(pmocDocuments.id, id), with: { customer: { columns: { name: true } } } }),
    pmocFormOptions(),
  ]);
  if (!doc) notFound();

  return (
    <>
      <PageHeader
        title="Editar PMOC"
        description={`${doc.customer.name}. Para um novo período com outra ART, use Renovar na ficha do PMOC.`}
        back={{ href: `/admin/pmoc/${doc.id}`, label: "Voltar ao PMOC" }}
      />
      <PmocForm
        action={updatePmoc.bind(null, doc.id)}
        submitLabel="Salvar PMOC"
        cancelHref={`/admin/pmoc/${doc.id}`}
        customers={options.customers}
        sites={options.sites}
        initial={{
          customerId: doc.customerId,
          siteId: doc.siteId ?? "",
          responsibleName: doc.responsibleName,
          responsibleRegistry: doc.responsibleRegistry ?? "",
          artNumber: doc.artNumber ?? "",
          validFrom: doc.validFrom,
          validUntil: doc.validUntil,
          notes: doc.notes ?? "",
        }}
      />
    </>
  );
}
