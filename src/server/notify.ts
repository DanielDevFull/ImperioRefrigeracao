import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { customers, notifications, technicians, user } from "@/db/schema";

type Note = { title: string; body?: string; link?: string };

export async function notifyUser(tx: Tx | typeof db, userId: string | null | undefined, note: Note) {
  if (!userId) return;
  await tx.insert(notifications).values({ userId, ...note });
}

export async function notifyTechnician(tx: Tx | typeof db, technicianId: string | null | undefined, note: Note) {
  if (!technicianId) return;
  const t = await tx.query.technicians.findFirst({ where: eq(technicians.id, technicianId), columns: { userId: true } });
  await notifyUser(tx, t?.userId, note);
}

export async function notifyCustomer(tx: Tx | typeof db, customerId: string | null | undefined, note: Note) {
  if (!customerId) return;
  const c = await tx.query.customers.findFirst({ where: eq(customers.id, customerId), columns: { userId: true } });
  await notifyUser(tx, c?.userId, note);
}

/** Notifica todos os administradores e gestores. */
export async function notifyStaff(tx: Tx | typeof db, note: Note) {
  const staff = await tx.select({ id: user.id }).from(user).where(inArray(user.role, ["admin", "gestor"]));
  if (staff.length) await tx.insert(notifications).values(staff.map((s) => ({ userId: s.id, ...note })));
}
