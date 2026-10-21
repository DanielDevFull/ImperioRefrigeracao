import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { commissionEntries, stockLocations, technicianAbsences, workOrders } from "@/db/schema";
import { materialsChargedFor } from "@/server/commissions";

/** Tudo o que o cockpit da OM precisa, numa leitura. */
export async function loadWorkOrder(id: string) {
  const wo = await db.query.workOrders.findFirst({
    where: eq(workOrders.id, id),
    with: {
      customer: { columns: { id: true, code: true, name: true, tradeName: true, phone: true, whatsapp: true, email: true } },
      site: true,
      equipment: { with: { type: { columns: { name: true } } } },
      plan: { columns: { id: true, name: true, isPmoc: true, estimatedMinutes: true } },
      technician: { columns: { id: true, name: true, color: true, phone: true } },
      createdBy: { columns: { name: true } },
      receivable: { columns: { id: true, status: true, dueDate: true, amount: true, paidAt: true, paidAmount: true } },
      tasks: { orderBy: (t, { asc }) => [asc(t.position)] },
      photos: { orderBy: (p, { asc }) => [asc(p.createdAt)] },
      materials: {
        with: {
          product: { columns: { id: true, name: true, unit: true, sku: true } },
          location: { columns: { id: true, name: true } },
        },
        orderBy: (m, { asc }) => [asc(m.createdAt)],
      },
      events: {
        with: { user: { columns: { name: true } } },
        orderBy: (e, { desc }) => [desc(e.createdAt)],
      },
    },
  });
  if (!wo) return null;

  const [commissions, materialsCharged, techLocation, absence] = await Promise.all([
    db.query.commissionEntries.findMany({
      where: eq(commissionEntries.workOrderId, id),
      with: { technician: { columns: { name: true, color: true } } },
    }),
    materialsChargedFor(db, id),
    wo.technicianId
      ? db.query.stockLocations.findFirst({
          where: and(eq(stockLocations.technicianId, wo.technicianId), eq(stockLocations.active, true)),
          columns: { id: true },
        })
      : Promise.resolve(undefined),
    wo.technicianId && wo.scheduledDate
      ? db.query.technicianAbsences.findFirst({
          where: and(
            eq(technicianAbsences.technicianId, wo.technicianId),
            lte(technicianAbsences.startDate, wo.scheduledDate),
            gte(technicianAbsences.endDate, wo.scheduledDate),
          ),
          columns: { startDate: true, endDate: true, reason: true },
        })
      : Promise.resolve(undefined),
  ]);

  return { wo, commissions, materialsCharged, techLocationId: techLocation?.id ?? null, absenceOnDate: absence ?? null };
}

export type LoadedWorkOrder = NonNullable<Awaited<ReturnType<typeof loadWorkOrder>>>;
