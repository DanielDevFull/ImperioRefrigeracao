import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { contractEquipment, customerSites, customers, equipment, maintenancePlans } from "@/db/schema";
import { addressLine } from "@/lib/format";

export type CustomerOption = { id: string; name: string; pmocEquipment: number; pmocBySite: Record<string, number> };
export type SiteOption = { id: string; customerId: string; name: string; isPrimary: boolean; address: string };

/** Opções do formulário de PMOC: clientes (com contagem de equipamentos em plano PMOC) e locais. */
export async function pmocFormOptions() {
  const [cs, ss, links] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name, tradeName: customers.tradeName })
      .from(customers)
      .orderBy(asc(customers.name)),
    db.query.customerSites.findMany({ orderBy: [asc(customerSites.name)] }),
    db
      .select({ customerId: equipment.customerId, siteId: equipment.siteId })
      .from(contractEquipment)
      .innerJoin(equipment, eq(equipment.id, contractEquipment.equipmentId))
      .innerJoin(maintenancePlans, eq(maintenancePlans.id, contractEquipment.maintenancePlanId))
      .where(and(eq(contractEquipment.active, true), eq(maintenancePlans.isPmoc, true), ne(equipment.status, "removido"))),
  ]);

  const customerOptions: CustomerOption[] = cs.map((c) => {
    const mine = links.filter((l) => l.customerId === c.id);
    const bySite: Record<string, number> = {};
    for (const l of mine) if (l.siteId) bySite[l.siteId] = (bySite[l.siteId] ?? 0) + 1;
    return { id: c.id, name: c.tradeName ? `${c.name} (${c.tradeName})` : c.name, pmocEquipment: mine.length, pmocBySite: bySite };
  });
  const siteOptions: SiteOption[] = ss.map((s) => ({
    id: s.id,
    customerId: s.customerId,
    name: s.name,
    isPrimary: s.isPrimary,
    address: addressLine(s),
  }));
  return { customers: customerOptions, sites: siteOptions };
}
