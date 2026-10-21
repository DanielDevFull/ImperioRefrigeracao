"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { type ActionState, formValues, runAction, zodFieldErrors } from "@/lib/action";
import { auth } from "@/lib/auth";
import { assertRole } from "@/lib/auth/session";
import { authErrorMessage } from "./_lib/auth-errors";

const STAFF = ["admin", "gestor"] as const;
type StaffRole = (typeof STAFF)[number];

const password = z
  .string({ error: "Informe a senha." })
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(128, "A senha pode ter no máximo 128 caracteres.");

const newAccessSchema = z.object({
  name: z.string({ error: "Informe o nome." }).min(2, "Informe o nome completo."),
  email: z.email("Informe um e-mail válido."),
  password,
  role: z.enum(STAFF, { error: "Escolha o perfil: administrador ou gestor." }),
});

function done(message: string, id?: string): ActionState {
  revalidatePath("/admin/usuarios");
  return { ok: true, message, id };
}

async function findTarget(userId: string) {
  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target) throw new Error("Este acesso não existe mais. Atualize a página.");
  return target;
}

/** Cria um acesso da equipe interna (administrador ou gestor). */
export async function createStaffAccess(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(["admin"]);
    const f = formValues(fd);
    const parsed = newAccessSchema.safeParse({
      name: f.str("name") ?? undefined,
      email: f.str("email")?.toLowerCase() ?? undefined,
      password: f.str("password") ?? undefined,
      role: f.str("role") ?? undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: "Confira os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    const { name, email, password: pass, role } = parsed.data;
    try {
      // Chamada de servidor sem headers: a permissão já foi checada por assertRole.
      const res = await auth.api.createUser({ body: { name, email, password: pass, role } });
      return done("Acesso criado", res.user.id);
    } catch (e) {
      const msg = authErrorMessage(e, "Não foi possível criar o acesso. Tente novamente.");
      if (msg.startsWith("Já existe")) return { ok: false, error: msg, fieldErrors: { email: "E-mail já cadastrado." } };
      return { ok: false, error: msg };
    }
  });
}

/** Define uma nova senha provisória para o acesso. */
export async function resetAccessPassword(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(["admin"]);
    const parsed = password.safeParse(formValues(fd).str("password") ?? undefined);
    if (!parsed.success) {
      return { ok: false, error: "Confira a senha.", fieldErrors: { password: parsed.error.issues[0]?.message ?? "Senha inválida." } };
    }
    const target = await findTarget(userId);
    try {
      await auth.api.setUserPassword({ body: { userId: target.id, newPassword: parsed.data }, headers: await headers() });
    } catch (e) {
      return { ok: false, error: authErrorMessage(e) };
    }
    return done(`Senha de ${target.name} redefinida`);
  });
}

/** Troca o perfil de um acesso da equipe entre administrador e gestor. */
export async function setStaffRole(userId: string, role: StaffRole): Promise<ActionState> {
  return runAction(async () => {
    const me = await assertRole(["admin"]);
    if (!STAFF.includes(role)) throw new Error("Perfil inválido.");
    if (userId === me.id) throw new Error("Você não pode mudar o próprio perfil. Peça a outro administrador.");
    const target = await findTarget(userId);
    if (!STAFF.includes((target.role ?? "") as StaffRole)) {
      throw new Error("Só é possível trocar o perfil de acessos da equipe interna.");
    }
    if (target.role === role) return done("Perfil mantido");
    try {
      await auth.api.setRole({ body: { userId: target.id, role }, headers: await headers() });
    } catch (e) {
      return { ok: false, error: authErrorMessage(e) };
    }
    return done(`${target.name} agora é ${role === "admin" ? "administrador" : "gestor"}`);
  });
}

/** Bloqueia o acesso (encerra as sessões abertas). */
export async function blockAccess(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const me = await assertRole(["admin"]);
    if (userId === me.id) throw new Error("Você não pode bloquear o próprio acesso.");
    const target = await findTarget(userId);
    const reason = formValues(fd).str("reason")?.slice(0, 200) ?? "Bloqueado pela administração";
    try {
      await auth.api.banUser({ body: { userId: target.id, banReason: reason }, headers: await headers() });
    } catch (e) {
      return { ok: false, error: authErrorMessage(e) };
    }
    return done(`Acesso de ${target.name} bloqueado`);
  });
}

export async function unblockAccess(userId: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(["admin"]);
    const target = await findTarget(userId);
    try {
      await auth.api.unbanUser({ body: { userId: target.id }, headers: await headers() });
    } catch (e) {
      return { ok: false, error: authErrorMessage(e) };
    }
    return done(`Acesso de ${target.name} desbloqueado`);
  });
}

/** Encerra todas as sessões abertas do acesso (desconecta de todos os aparelhos). */
export async function revokeAccessSessions(userId: string): Promise<ActionState> {
  return runAction(async () => {
    const me = await assertRole(["admin"]);
    if (userId === me.id) throw new Error("Para sair dos seus aparelhos, use Sair no menu do seu perfil.");
    const target = await findTarget(userId);
    try {
      await auth.api.revokeUserSessions({ body: { userId: target.id }, headers: await headers() });
    } catch (e) {
      return { ok: false, error: authErrorMessage(e) };
    }
    return done(`Sessões de ${target.name} encerradas`);
  });
}

/** Exclui o login. Cadastros de técnico/cliente vinculados continuam, apenas sem acesso. */
export async function removeAccess(userId: string): Promise<ActionState> {
  return runAction(async () => {
    const me = await assertRole(["admin"]);
    if (userId === me.id) throw new Error("Você não pode excluir o próprio acesso.");
    const target = await findTarget(userId);
    try {
      await auth.api.removeUser({ body: { userId: target.id }, headers: await headers() });
    } catch (e) {
      return { ok: false, error: authErrorMessage(e) };
    }
    revalidatePath("/admin/tecnicos");
    revalidatePath("/admin/clientes");
    return done(`Acesso de ${target.name} excluído`);
  });
}
