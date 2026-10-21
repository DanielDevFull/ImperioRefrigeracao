import "server-only";
import { and, eq, gte, inArray, isNull, lt, lte, ne, notInArray, or } from "drizzle-orm";
import { db } from "@/db";
import { technicianAbsences, technicians, workOrders } from "@/db/schema";
import { ACTIVE_STATUSES } from "@/server/core/work-order-flow";
import { DEFAULT_MINUTES, type BoardItem, type BoardTechnician } from "./board";

const LOCKED_STATUSES: ("em_deslocamento" | "em_execucao" | "concluida" | "cancelada")[] = ["em_deslocamento", "em_execucao", "concluida", "cancelada"];

export async function loadBoard({ start, end, today }: { start: string; end: string; today: string }) {
  const [techs, absences, rows] = await Promise.all([
    db.query.technicians.findMany({
      where: eq(technicians.active, true),
      columns: { id: true, name: true, color: true },
      orderBy: (t, { asc }) => [asc(t.name)],
    }),
    db.query.technicianAbsences.findMany({
      where: and(lte(technicianAbsences.startDate, end), gte(technicianAbsences.endDate, start)),
      columns: { technicianId: true, startDate: true, endDate: true, reason: true },
    }),
    db.query.workOrders.findMany({
      where: or(
        // OMs do período (qualquer técnico), menos as canceladas
        and(gte(workOrders.scheduledDate, start), lte(workOrders.scheduledDate, end), ne(workOrders.status, "cancelada")),
        // Fila de despacho: sem técnico, sem data ou atrasadas que ainda podem ser movidas
        and(
          inArray(workOrders.status, ACTIVE_STATUSES),
          or(
            isNull(workOrders.technicianId),
            isNull(workOrders.scheduledDate),
            and(lt(workOrders.scheduledDate, today), notInArray(workOrders.status, LOCKED_STATUSES)),
          ),
        ),
      ),
      columns: {
        id: true,
        number: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        scheduledDate: true,
        scheduledTime: true,
        technicianId: true,
      },
      with: {
        customer: { columns: { name: true, tradeName: true } },
        equipment: { columns: { location: true }, with: { type: { columns: { name: true } } } },
        plan: { columns: { estimatedMinutes: true } },
      },
      orderBy: (w, { asc }) => [asc(w.scheduledDate), asc(w.scheduledTime), asc(w.number)],
      limit: 600,
    }),
  ]);

  const board: BoardTechnician[] = techs.map((t) => ({
    ...t,
    absences: absences.filter((a) => a.technicianId === t.id).map(({ startDate, endDate, reason }) => ({ startDate, endDate, reason })),
  }));

  const items: BoardItem[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    type: r.type,
    status: r.status,
    priority: r.priority,
    scheduledDate: r.scheduledDate,
    scheduledTime: r.scheduledTime?.slice(0, 5) ?? null,
    technicianId: r.technicianId,
    customerName: r.customer.tradeName ?? r.customer.name,
    equipmentLabel: r.equipment ? [r.equipment.type?.name, r.equipment.location].filter(Boolean).join(", ") || null : null,
    minutes: r.plan?.estimatedMinutes ?? DEFAULT_MINUTES[r.type] ?? 60,
  }));

  return { technicians: board, items };
}
