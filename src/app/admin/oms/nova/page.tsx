import type { Metadata } from "next";
import { eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { customers, equipment, maintenancePlans } from "@/db/schema";
import { PageHeader } from "@/components/system/page-header";
import { param } from "@/lib/params";
import { todayISO } from "@/lib/dates";
import { customerContextAction } from "../actions";
import { activeTechnicians } from "../_lib/queries";
import { isUuid } from "../_lib/constants";
import { NewOmForm } from "./_components/new-om-form";

export const metadata: Metadata = { title: "Nova OM" };

export default async function NovaOmPage({ searchParams }: PageProps<"/admin/oms/nova">) {
  const sp = await searchParams;
  let customerId = param(sp, "customerId");
  const equipmentId = param(sp, "equipmentId");

  // Equipamento informado define o cliente (vindo da ficha do equipamento).
  let initialEquipment: { id: string; siteId: string | null } | null = null;
  if (isUuid(equipmentId)) {
    const e = await db.query.equipment.findFirst({
      where: eq(equipment.id, equipmentId),
      columns: { id: true, customerId: true, siteId: true },
    });
    if (e) {
      customerId = e.customerId;
      initialEquipment = { id: e.id, siteId: e.siteId };
    }
  }

  const [customerList, technicians, plans] = await Promise.all([
    db.query.customers.findMany({
      where: ne(customers.status, "inativo"),
      columns: { id: true, code: true, name: true, tradeName: true, document: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    }),
    activeTechnicians(),
    db.query.maintenancePlans.findMany({
      where: eq(maintenancePlans.active, true),
      columns: { id: true, name: true, isPmoc: true, equipmentTypeId: true, estimatedMinutes: true, visitReferenceValue: true },
      with: { tasks: { columns: { id: true } } },
      orderBy: (p, { asc }) => [asc(p.name)],
    }),
  ]);

  const validCustomer = isUuid(customerId) && customerList.some((c) => c.id === customerId) ? customerId : null;
  const initialContext = validCustomer ? await customerContextAction(validCustomer) : null;

  return (
    <>
      <PageHeader
        title="Nova OM"
        description="Abra uma ordem de manutenção avulsa: chamado corretivo, instalação, visita técnica ou uma preventiva fora do calendário."
        back={{ href: "/admin/oms", label: "Ordens de manutenção" }}
      />
      <NewOmForm
        customers={customerList}
        technicians={technicians}
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          isPmoc: p.isPmoc,
          equipmentTypeId: p.equipmentTypeId,
          estimatedMinutes: p.estimatedMinutes,
          visitReferenceValue: p.visitReferenceValue,
          taskCount: p.tasks.length,
        }))}
        initialCustomerId={validCustomer}
        initialContext={initialContext}
        initialEquipment={initialEquipment}
        today={todayISO()}
      />
    </>
  );
}
