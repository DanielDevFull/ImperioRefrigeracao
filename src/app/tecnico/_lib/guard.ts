import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { technicians, workOrderTasks, workOrders } from "@/db/schema";
import type { AppUser } from "@/lib/auth/session";
import type { Actor } from "@/server/work-orders";

/** Técnico vinculado ao usuário de uma Server Action (lança erro em vez de redirecionar). */
export async function technicianFor(user: AppUser) {
  const technician = await db.query.technicians.findFirst({ where: eq(technicians.userId, user.id) });
  if (!technician) throw new Error("Seu usuário não está vinculado a um técnico. Fale com o escritório.");
  return technician;
}

const NOT_YOURS = "OM não encontrada ou não atribuída a você.";

/** Carrega a OM e confirma que ela é do técnico logado. */
export async function ownedWorkOrder(workOrderId: string, technicianId: string) {
  const wo = await db.query.workOrders.findFirst({ where: eq(workOrders.id, workOrderId) });
  if (!wo || wo.technicianId !== technicianId) throw new Error(NOT_YOURS);
  return wo;
}

/** Carrega um item do checklist e confirma que a OM dele é do técnico logado. */
export async function ownedTask(taskId: string, technicianId: string) {
  const task = await db.query.workOrderTasks.findFirst({ where: eq(workOrderTasks.id, taskId) });
  if (!task) throw new Error("Item do checklist não encontrado.");
  const wo = await ownedWorkOrder(task.workOrderId, technicianId);
  return { task, wo };
}

export function actorOf(user: AppUser, pos?: { lat?: number | null; lng?: number | null }): Actor {
  const ok = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { userId: user.id, lat: ok(pos?.lat), lng: ok(pos?.lng) };
}
