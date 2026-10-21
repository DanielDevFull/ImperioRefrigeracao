import "server-only";
import { and, desc, eq, inArray, max, ne } from "drizzle-orm";
import { db } from "@/db";
import { contractEquipment, customerSites, customers, equipment, maintenancePlans, pmocDocuments, workOrders } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { isRenewed, validityOf, type Validity } from "./pmoc";

/** Lista de PMOCs com vigência, equipamentos cobertos e a última OM de PMOC de cada local. */
export async function listPmocDocuments() {
  const today = todayISO();
  const [docs, links, lastByEquipment] = await Promise.all([
    db.query.pmocDocuments.findMany({
      with: {
        customer: { columns: { id: true, name: true, tradeName: true } },
        site: { columns: { id: true, name: true, city: true, district: true } },
      },
      orderBy: [desc(pmocDocuments.validUntil)],
    }),
    db
      .select({
        customerId: equipment.customerId,
        siteId: equipment.siteId,
        equipmentId: equipment.id,
      })
      .from(contractEquipment)
      .innerJoin(equipment, eq(equipment.id, contractEquipment.equipmentId))
      .innerJoin(maintenancePlans, eq(maintenancePlans.id, contractEquipment.maintenancePlanId))
      .where(and(eq(contractEquipment.active, true), eq(maintenancePlans.isPmoc, true), ne(equipment.status, "removido"))),
    db
      .select({ equipmentId: workOrders.equipmentId, last: max(workOrders.finishedAt) })
      .from(workOrders)
      .where(and(eq(workOrders.status, "concluida"), inArray(workOrders.type, ["pmoc", "preventiva"])))
      .groupBy(workOrders.equipmentId),
  ]);

  const lastMap = new Map(lastByEquipment.map((r) => [r.equipmentId, r.last]));

  const rows = docs.map((d) => {
    const eqs = links.filter((l) => l.customerId === d.customerId && (!d.siteId || l.siteId === d.siteId));
    let last: Date | null = null;
    for (const e of eqs) {
      const l = lastMap.get(e.equipmentId);
      if (l && (!last || l > last)) last = l;
    }
    const validity: Validity = validityOf(d, today, isRenewed(d, docs));
    return { doc: d, equipmentCount: eqs.length, lastPmocAt: last, validity };
  });

  // Locais com equipamentos em plano PMOC e sem documento vigente
  const groups = new Map<string, { customerId: string; siteId: string | null; count: number }>();
  for (const l of links) {
    const k = `${l.customerId}:${l.siteId ?? ""}`;
    const g = groups.get(k) ?? { customerId: l.customerId, siteId: l.siteId, count: 0 };
    g.count++;
    groups.set(k, g);
  }
  const missingKeys = [...groups.values()].filter(
    (g) =>
      !rows.some(
        (r) =>
          r.doc.customerId === g.customerId &&
          (!r.doc.siteId || r.doc.siteId === g.siteId) &&
          (r.validity.key === "vigente" || r.validity.key === "vencendo" || r.validity.key === "futuro"),
      ),
  );
  let missing: { customerId: string; customerName: string; siteId: string | null; siteName: string | null; count: number }[] = [];
  if (missingKeys.length) {
    const [cs, ss] = await Promise.all([
      db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, missingKeys.map((m) => m.customerId))),
      db
        .select({ id: customerSites.id, name: customerSites.name })
        .from(customerSites)
        .where(inArray(customerSites.id, missingKeys.map((m) => m.siteId).filter((v): v is string => !!v).concat(["00000000-0000-0000-0000-000000000000"]))),
    ]);
    missing = missingKeys.map((m) => ({
      customerId: m.customerId,
      customerName: cs.find((c) => c.id === m.customerId)?.name ?? "Cliente",
      siteId: m.siteId,
      siteName: ss.find((s) => s.id === m.siteId)?.name ?? null,
      count: m.count,
    }));
    missing.sort((a, b) => a.customerName.localeCompare(b.customerName, "pt-BR"));
  }

  return { rows, missing, today };
}
