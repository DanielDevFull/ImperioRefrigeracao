import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { formatCustomerCode } from "@/lib/format";
import { deleteCustomer } from "../../actions";
import { ConfirmAndGo } from "../../_components/confirm-go";
import { CustomerForm } from "../../_components/customer-form";
import { activeTechnicians, customerHistoryCount, getCustomerForEdit, isUuid } from "../../_lib/queries";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditarClientePage({ params }: PageProps<"/admin/clientes/[id]/editar">) {
  const { id } = await params;
  const [customer, technicians, history] = await Promise.all([
    getCustomerForEdit(id),
    activeTechnicians(),
    isUuid(id) ? customerHistoryCount(id) : 0,
  ]);
  if (!customer) notFound();
  // técnico inativo ainda aparece se for o atual
  const techs =
    customer.defaultTechnicianId && !technicians.some((t) => t.id === customer.defaultTechnicianId)
      ? [...technicians, { id: customer.defaultTechnicianId, name: "Técnico inativo" }]
      : technicians;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Editar cliente"
        description={`${formatCustomerCode(customer.code)}, ${customer.tradeName || customer.name}. Os locais de atendimento são editados na ficha do cliente.`}
        back={{ href: `/admin/clientes/${id}`, label: customer.tradeName || customer.name }}
      />
      <CustomerForm
        technicians={techs}
        initial={{
          id: customer.id,
          personType: customer.personType,
          name: customer.name,
          tradeName: customer.tradeName,
          document: customer.document,
          email: customer.email,
          phone: customer.phone,
          whatsapp: customer.whatsapp,
          defaultTechnicianId: customer.defaultTechnicianId,
          notes: customer.notes,
          status: customer.status,
        }}
      />
      <Panel className="mt-8" title="Excluir cadastro">
        {history > 0 || customer.userId ? (
          <p className="text-sm text-steel">
            Este cliente tem histórico (OMs, contratos, equipamentos, cobranças ou acesso ao portal), então o cadastro não
            pode ser excluído. Para tirá-lo da operação, mude a situação para <span className="text-silver">Inativo</span>{" "}
            e salve.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-steel">
              Cadastro sem nenhum histórico. Se foi criado por engano, você pode excluí-lo de vez.
            </p>
            <ConfirmAndGo
              action={deleteCustomer.bind(null, customer.id)}
              title="Excluir este cliente?"
              description="O cadastro e os locais de atendimento serão apagados. Esta ação não pode ser desfeita."
              confirmLabel="Excluir cliente"
              redirectTo="/admin/clientes"
              destructive
              variant="destructive"
            >
              <Trash2 />
              Excluir cliente
            </ConfirmAndGo>
          </div>
        )}
      </Panel>
    </div>
  );
}
