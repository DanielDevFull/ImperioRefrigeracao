import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, technicians, type UserRole } from "@/db/schema";
import { auth } from "./index";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
};

export const STAFF_ROLES: UserRole[] = ["admin", "gestor"];

export function homeForRole(role: UserRole | string | null | undefined) {
  switch (role) {
    case "admin":
    case "gestor":
      return "/admin";
    case "tecnico":
      return "/tecnico";
    default:
      return "/portal";
  }
}

/** Sessão atual (deduplicada por requisição). */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    role: ((u as { role?: string }).role ?? "cliente") as UserRole,
  };
});

/** Exige login; opcionalmente restringe por perfil. Redireciona quando não autorizado. */
export async function requireUser(allowed?: UserRole[]): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (allowed && !allowed.includes(user.role)) redirect(homeForRole(user.role));
  return user;
}

export const requireStaff = () => requireUser(STAFF_ROLES);

/** Técnico logado (app do técnico). */
export const requireTechnician = cache(async () => {
  const user = await requireUser(["tecnico", "admin", "gestor"]);
  const tech = await db.query.technicians.findFirst({ where: eq(technicians.userId, user.id) });
  if (!tech) {
    if (STAFF_ROLES.includes(user.role)) redirect("/admin/tecnicos?aviso=sem-tecnico");
    redirect("/login?erro=sem-cadastro");
  }
  return { user, technician: tech };
});

/** Cliente logado (portal). */
export const requireCustomer = cache(async () => {
  const user = await requireUser(["cliente", "admin", "gestor"]);
  const customer = await db.query.customers.findFirst({ where: eq(customers.userId, user.id) });
  if (!customer) {
    if (STAFF_ROLES.includes(user.role)) redirect("/admin/clientes?aviso=sem-portal");
    redirect("/login?erro=sem-cadastro");
  }
  return { user, customer };
});

/** Para Server Actions: lança erro em vez de redirecionar. */
export async function assertRole(allowed: UserRole[]): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  if (!allowed.includes(user.role)) throw new Error("Você não tem permissão para esta ação.");
  return user;
}
