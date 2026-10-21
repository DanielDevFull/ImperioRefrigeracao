"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, between, eq, gte, inArray, like, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { stockLocations, technicianAbsences, technicians, user, workOrders } from "@/db/schema";
import { auth } from "@/lib/auth";
import { assertRole } from "@/lib/auth/session";
import { type ActionState, formValues, runAction, zodFieldErrors } from "@/lib/action";
import { todayISO } from "@/lib/dates";
import { formatDate, onlyDigits } from "@/lib/format";
import { activeWorkOrderStatuses } from "@/lib/labels";
import { authErrorMessage } from "./_lib/auth-errors";
import { PLATE_RE, firstName, normalizePlate, vehicleLocationName } from "./_lib/constants";

const STAFF: ("admin" | "gestor")[] = ["admin", "gestor"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isValidCPF(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

const techSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome completo do técnico."),
  phone: z
    .string()
    .nullable()
    .refine((v) => !v || [10, 11].includes(v.length), "Telefone incompleto: use DDD + número."),
  email: z.email("E-mail inválido. Confira o endereço digitado.").nullable(),
  document: z
    .string()
    .nullable()
    .refine((v) => !v || isValidCPF(v), "CPF inválido: confira os 11 dígitos."),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Escolha uma cor para o técnico."),
  skills: z.array(z.string().min(1).max(40, "Especialidade muito longa (máximo 40 letras).")).max(20, "Use no máximo 20 especialidades."),
  vehiclePlate: z
    .string()
    .nullable()
    .refine((v) => !v || PLATE_RE.test(v), "Placa inválida: use o formato ABC-1234 ou ABC-1D23."),
  admissionDate: z.string().regex(ISO, "Data de admissão inválida.").nullable(),
  notes: z.string().max(2000, "Observações muito longas (máximo 2.000 caracteres).").nullable(),
});

const accessSchema = z.object({
  accessEmail: z.email("Informe um e-mail válido para o login."),
  accessPassword: z
    .string("Informe uma senha temporária.")
    .min(6, "A senha precisa de pelo menos 6 caracteres.")
    .max(128, "Senha muito longa (máximo 128 caracteres)."),
});

function readTechnician(fd: FormData) {
  const f = formValues(fd);
  const phone = onlyDigits(f.str("phone"));
  const document = onlyDigits(f.str("document"));
  return {
    name: f.str("name") ?? "",
    phone: phone || null,
    email: f.str("email")?.toLowerCase() ?? null,
    document: document || null,
    color: f.str("color") ?? "",
    skills: [...new Set(f.all("skills").map((s) => s.trim()).filter(Boolean))],
    vehiclePlate: normalizePlate(f.str("vehiclePlate")),
    admissionDate: f.str("admissionDate"),
    notes: f.str("notes"),
  };
}

function readAccess(fd: FormData) {
  const f = formValues(fd);
  return { accessEmail: f.str("accessEmail")?.toLowerCase() ?? "", accessPassword: f.str("accessPassword") ?? "" };
}

async function emailInUse(email: string) {
  const found = await db.query.user.findFirst({ where: eq(user.email, email), columns: { id: true } });
  return Boolean(found);
}

function revalidateTechnician(id?: string) {
  revalidatePath("/admin/tecnicos");
  if (id) revalidatePath(`/admin/tecnicos/${id}`);
  revalidatePath("/admin/agenda");
}

async function upcomingCount(technicianId: string, from: string, to?: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.technicianId, technicianId),
        inArray(workOrders.status, [...activeWorkOrderStatuses]),
        to ? between(workOrders.scheduledDate, from, to) : gte(workOrders.scheduledDate, from),
      ),
    );
  return row?.n ?? 0;
}

/* ───────────────────────── cadastro ───────────────────────── */

export async function createTechnician(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const f = formValues(fd);
    const withAccess = f.bool("createAccess");
    const withStock = f.bool("createStock");

    const parsed = techSchema.safeParse(readTechnician(fd));
    const fieldErrors: Record<string, string> = parsed.success ? {} : zodFieldErrors(parsed.error);
    const access = withAccess ? accessSchema.safeParse(readAccess(fd)) : null;
    if (access && !access.success) Object.assign(fieldErrors, zodFieldErrors(access.error));
    if (withStock && parsed.success && !parsed.data.vehiclePlate)
      fieldErrors.vehiclePlate = "Informe a placa para criar o estoque do veículo.";
    if (access?.success && (await emailInUse(access.data.accessEmail)))
      fieldErrors.accessEmail = "Já existe um acesso com este e-mail. Use outro e-mail.";
    if (!parsed.success || Object.keys(fieldErrors).length)
      return { ok: false, error: "Confira os campos destacados.", fieldErrors };

    const data = parsed.data;
    let userId: string | null = null;
    if (access?.success) {
      try {
        const res = await auth.api.createUser({
          body: { email: access.data.accessEmail, password: access.data.accessPassword, name: data.name, role: "tecnico" },
        });
        userId = res.user.id;
      } catch (e) {
        return { ok: false, error: authErrorMessage(e, "Não foi possível criar o acesso ao app. Tente novamente.") };
      }
    }

    try {
      const id = await db.transaction(async (tx) => {
        const [t] = await tx
          .insert(technicians)
          .values({ ...data, email: data.email ?? (access?.success ? access.data.accessEmail : null), userId })
          .returning({ id: technicians.id });
        if (withStock && data.vehiclePlate) {
          await tx.insert(stockLocations).values({
            name: vehicleLocationName(data.vehiclePlate, data.name),
            type: "veiculo",
            technicianId: t.id,
          });
        }
        return t.id;
      });
      revalidateTechnician(id);
      if (withStock) revalidatePath("/admin/estoque");
      if (userId) revalidatePath("/admin/usuarios");
      const extras = [userId && "acesso ao app", withStock && "estoque do veículo"].filter(Boolean);
      return {
        ok: true,
        id,
        message: extras.length ? `Técnico cadastrado com ${extras.join(" e ")}` : "Técnico cadastrado",
      };
    } catch (e) {
      // desfaz o login criado se o cadastro falhar
      if (userId) await db.delete(user).where(eq(user.id, userId));
      throw e;
    }
  });
}

export async function updateTechnician(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const current = await db.query.technicians.findFirst({ where: eq(technicians.id, id) });
    if (!current) return { ok: false, error: "Técnico não encontrado. Ele pode ter sido removido." };
    const parsed = techSchema.safeParse(readTechnician(fd));
    if (!parsed.success)
      return { ok: false, error: "Confira os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const data = parsed.data;

    await db.transaction(async (tx) => {
      await tx.update(technicians).set(data).where(eq(technicians.id, id));
      // mantém o nome do login e o nome do estoque do veículo em dia
      if (current.userId && current.name !== data.name)
        await tx.update(user).set({ name: data.name }).where(eq(user.id, current.userId));
      const renamed = data.vehiclePlate !== current.vehiclePlate || firstName(data.name) !== firstName(current.name);
      if (renamed && data.vehiclePlate) {
        await tx
          .update(stockLocations)
          .set({ name: vehicleLocationName(data.vehiclePlate, data.name) })
          .where(
            and(
              eq(stockLocations.technicianId, id),
              eq(stockLocations.type, "veiculo"),
              like(stockLocations.name, "Veículo %"),
            ),
          );
      }
    });
    revalidateTechnician(id);
    revalidatePath("/admin/estoque");
    return { ok: true, id, message: "Técnico salvo" };
  });
}

export async function setTechnicianActive(id: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const [t] = await db.update(technicians).set({ active }).where(eq(technicians.id, id)).returning();
    if (!t) return { ok: false, error: "Técnico não encontrado." };
    revalidateTechnician(id);
    if (active) return { ok: true, message: `${firstName(t.name)} reativado` };
    const pending = await upcomingCount(id, todayISO());
    return {
      ok: true,
      message:
        pending > 0
          ? `${firstName(t.name)} desativado. ${pending} OM${pending > 1 ? "s" : ""} agendada${pending > 1 ? "s" : ""} continua${pending > 1 ? "m" : ""} com ele: reatribua na agenda.`
          : `${firstName(t.name)} desativado`,
    };
  });
}

/* ───────────────────────── ausências ───────────────────────── */

const absenceSchema = z
  .object({
    startDate: z.string("Informe o início.").regex(ISO, "Informe o início."),
    endDate: z.string("Informe o fim.").regex(ISO, "Informe o fim."),
    reason: z.string().max(200, "Motivo muito longo (máximo 200 caracteres).").nullable(),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "O fim precisa ser igual ou depois do início." });

export async function addAbsence(technicianId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const f = formValues(fd);
    const parsed = absenceSchema.safeParse({ startDate: f.str("startDate"), endDate: f.str("endDate"), reason: f.str("reason") });
    if (!parsed.success)
      return { ok: false, error: "Confira as datas da ausência.", fieldErrors: zodFieldErrors(parsed.error) };
    const { startDate, endDate, reason } = parsed.data;
    const tech = await db.query.technicians.findFirst({ where: eq(technicians.id, technicianId), columns: { id: true } });
    if (!tech) return { ok: false, error: "Técnico não encontrado." };

    const overlap = await db.query.technicianAbsences.findFirst({
      where: and(
        eq(technicianAbsences.technicianId, technicianId),
        lte(technicianAbsences.startDate, endDate),
        gte(technicianAbsences.endDate, startDate),
      ),
    });
    if (overlap)
      return {
        ok: false,
        error: `Já existe uma ausência de ${formatDate(overlap.startDate)} a ${formatDate(overlap.endDate)}. Ajuste as datas ou remova a anterior.`,
      };

    await db.insert(technicianAbsences).values({ technicianId, startDate, endDate, reason });
    revalidateTechnician(technicianId);
    const clash = await upcomingCount(technicianId, startDate, endDate);
    return {
      ok: true,
      message:
        clash > 0
          ? `Ausência registrada. ${clash} OM${clash > 1 ? "s" : ""} já agendada${clash > 1 ? "s" : ""} nesses dias: reatribua na agenda.`
          : "Ausência registrada",
    };
  });
}

export async function deleteAbsence(absenceId: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const [row] = await db.delete(technicianAbsences).where(eq(technicianAbsences.id, absenceId)).returning();
    if (!row) return { ok: false, error: "Ausência não encontrada. Atualize a página." };
    revalidateTechnician(row.technicianId);
    return { ok: true, message: "Ausência removida" };
  });
}

/* ───────────────────────── acesso ao app ───────────────────────── */

export async function createAppAccess(technicianId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const tech = await db.query.technicians.findFirst({ where: eq(technicians.id, technicianId) });
    if (!tech) return { ok: false, error: "Técnico não encontrado." };
    if (tech.userId) return { ok: false, error: "Este técnico já tem acesso ao app." };
    const parsed = accessSchema.safeParse(readAccess(fd));
    if (!parsed.success)
      return { ok: false, error: "Confira o e-mail e a senha.", fieldErrors: zodFieldErrors(parsed.error) };
    const { accessEmail, accessPassword } = parsed.data;
    if (await emailInUse(accessEmail))
      return { ok: false, error: "Já existe um acesso com este e-mail.", fieldErrors: { accessEmail: "Use outro e-mail." } };

    let userId: string;
    try {
      const res = await auth.api.createUser({
        body: { email: accessEmail, password: accessPassword, name: tech.name, role: "tecnico" },
      });
      userId = res.user.id;
    } catch (e) {
      return { ok: false, error: authErrorMessage(e, "Não foi possível criar o acesso ao app. Tente novamente.") };
    }
    try {
      await db
        .update(technicians)
        .set({ userId, email: tech.email ?? accessEmail })
        .where(eq(technicians.id, technicianId));
    } catch (e) {
      await db.delete(user).where(eq(user.id, userId));
      throw e;
    }
    revalidateTechnician(technicianId);
    revalidatePath("/admin/usuarios");
    return { ok: true, message: "Acesso criado. Envie o e-mail e a senha ao técnico." };
  });
}

const passwordSchema = z.object({
  newPassword: z
    .string("Informe a nova senha.")
    .min(6, "A senha precisa de pelo menos 6 caracteres.")
    .max(128, "Senha muito longa (máximo 128 caracteres)."),
});

export async function resetAppPassword(technicianId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const tech = await db.query.technicians.findFirst({ where: eq(technicians.id, technicianId) });
    if (!tech?.userId) return { ok: false, error: "Este técnico ainda não tem acesso ao app. Crie o acesso primeiro." };
    const parsed = passwordSchema.safeParse({ newPassword: formValues(fd).str("newPassword") ?? "" });
    if (!parsed.success)
      return { ok: false, error: "Confira a nova senha.", fieldErrors: zodFieldErrors(parsed.error) };
    try {
      await auth.api.setUserPassword({
        body: { userId: tech.userId, newPassword: parsed.data.newPassword },
        headers: await headers(),
      });
    } catch (e) {
      return { ok: false, error: authErrorMessage(e, "Não foi possível redefinir a senha. Tente novamente.") };
    }
    return { ok: true, message: "Senha redefinida. Envie a nova senha ao técnico." };
  });
}

export async function setAppAccessBlocked(technicianId: string, blocked: boolean): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const tech = await db.query.technicians.findFirst({ where: eq(technicians.id, technicianId) });
    if (!tech?.userId) return { ok: false, error: "Este técnico não tem acesso ao app." };
    try {
      if (blocked) {
        await auth.api.banUser({
          body: { userId: tech.userId, banReason: "Acesso bloqueado pela empresa" },
          headers: await headers(),
        });
      } else {
        await auth.api.unbanUser({ body: { userId: tech.userId }, headers: await headers() });
      }
    } catch (e) {
      return { ok: false, error: authErrorMessage(e) };
    }
    revalidateTechnician(technicianId);
    revalidatePath("/admin/usuarios");
    return {
      ok: true,
      message: blocked ? "Acesso bloqueado. O técnico foi desconectado do app." : "Acesso desbloqueado",
    };
  });
}

/* ───────────────────────── estoque do veículo ───────────────────────── */

export async function createVehicleStock(technicianId: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const tech = await db.query.technicians.findFirst({ where: eq(technicians.id, technicianId) });
    if (!tech) return { ok: false, error: "Técnico não encontrado." };
    if (!tech.vehiclePlate)
      return { ok: false, error: "Cadastre a placa do veículo antes de criar o estoque (Editar técnico)." };
    const existing = await db.query.stockLocations.findFirst({
      where: and(eq(stockLocations.technicianId, technicianId), eq(stockLocations.type, "veiculo")),
    });
    if (existing) return { ok: false, error: `O técnico já tem o estoque "${existing.name}".` };
    await db.insert(stockLocations).values({
      name: vehicleLocationName(tech.vehiclePlate, tech.name),
      type: "veiculo",
      technicianId,
    });
    revalidateTechnician(technicianId);
    revalidatePath("/admin/estoque");
    return { ok: true, message: "Estoque do veículo criado" };
  });
}
