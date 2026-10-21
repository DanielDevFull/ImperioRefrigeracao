"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import {
  contracts,
  customerSites,
  customers,
  equipment,
  receivables,
  technicians,
  user,
  workOrders,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { assertRole } from "@/lib/auth/session";
import { formValues, runAction, zodFieldErrors, type ActionState } from "@/lib/action";
import { formatCEP, formatCustomerCode, onlyDigits } from "@/lib/format";
import { documentError } from "./_lib/document";

const STAFF = ["admin", "gestor"] as const;
const staff = () => assertRole([...STAFF]);

const optionalText = (max: number, label: string) =>
  z.string().max(max, `${label}: use no máximo ${max} caracteres.`).nullable();

const phoneField = (label: string) =>
  z
    .string()
    .nullable()
    .refine((v) => !v || v.length === 10 || v.length === 11, `${label}: informe DDD + número (10 ou 11 dígitos).`);

const customerSchema = z.object({
  personType: z.enum(["pf", "pj"], { error: "Escolha pessoa física ou jurídica." }),
  name: z.string({ error: "Informe o nome." }).min(2, "Informe o nome completo.").max(200, "Nome muito longo."),
  tradeName: optionalText(200, "Nome fantasia"),
  document: z.string().nullable(),
  email: z.email("E-mail inválido. Confira o endereço (ex.: contato@empresa.com.br).").nullable(),
  phone: phoneField("Telefone"),
  whatsapp: phoneField("WhatsApp"),
  defaultTechnicianId: z.uuid("Técnico inválido.").nullable(),
  notes: optionalText(4000, "Observações"),
  status: z.enum(["ativo", "inativo"]),
});

const siteSchema = z.object({
  name: z.string({ error: "Dê um nome ao local (ex.: Matriz, Casa)." }).min(2, "Dê um nome ao local (ex.: Matriz, Casa).").max(120),
  zip: z
    .string()
    .nullable()
    .refine((v) => !v || v.length === 8, "CEP tem 8 dígitos."),
  street: optionalText(200, "Logradouro"),
  number: optionalText(30, "Número"),
  complement: optionalText(120, "Complemento"),
  district: optionalText(120, "Bairro"),
  city: optionalText(120, "Cidade"),
  state: z
    .string()
    .nullable()
    .refine((v) => !v || /^[A-Z]{2}$/.test(v), "UF com 2 letras (ex.: SP)."),
  accessNotes: optionalText(2000, "Instruções de acesso"),
  areaM2: z.number().positive("Área deve ser maior que zero.").max(1_000_000).nullable(),
  occupants: z.number().int("Ocupantes: número inteiro.").min(0).max(100_000).nullable(),
});

function readCustomer(fd: FormData) {
  const v = formValues(fd);
  const personType = v.str("personType") === "pj" ? "pj" : "pf";
  const phone = onlyDigits(v.str("phone")) || null;
  return {
    personType,
    name: v.str("name"),
    tradeName: personType === "pj" ? v.str("tradeName") : null,
    document: onlyDigits(v.str("document")) || null,
    email: v.str("email")?.toLowerCase() ?? null,
    phone,
    whatsapp: v.bool("whatsappSame") ? phone : onlyDigits(v.str("whatsapp")) || null,
    defaultTechnicianId: v.str("defaultTechnicianId"),
    notes: v.str("notes"),
    status: v.str("status") === "inativo" ? "inativo" : "ativo",
  };
}

function readSite(fd: FormData, prefix = "") {
  const v = formValues(fd);
  const k = (n: string) => `${prefix}${n}`;
  const area = v.str(k("areaM2"));
  return {
    name: v.str(k("name")),
    zip: onlyDigits(v.str(k("zip"))) || null,
    street: v.str(k("street")),
    number: v.str(k("number")),
    complement: v.str(k("complement")),
    district: v.str(k("district")),
    city: v.str(k("city")),
    state: v.str(k("state"))?.toUpperCase() ?? null,
    accessNotes: v.str(k("accessNotes")),
    areaM2: area == null ? null : Number(area.replace(/\./g, "").replace(",", ".")),
    occupants: v.num(k("occupants")),
  };
}

function siteHasAddress(fd: FormData, prefix: string) {
  const v = formValues(fd);
  return ["zip", "street", "number", "district", "city"].some((n) => v.str(`${prefix}${n}`));
}

function prefixed(errors: Record<string, string>, prefix: string) {
  return Object.fromEntries(Object.entries(errors).map(([k, m]) => [`${prefix}${k}`, m]));
}

/** Cria ou atualiza o cliente (na criação, também o primeiro local de atendimento). */
export async function saveCustomer(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const id = formValues(fd).str("id");
    const parsed = customerSchema.safeParse(readCustomer(fd));
    const fieldErrors: Record<string, string> = parsed.success ? {} : zodFieldErrors(parsed.error);

    let existing: typeof customers.$inferSelect | undefined;
    if (id) {
      existing = await db.query.customers.findFirst({ where: eq(customers.id, id) });
      if (!existing) return { ok: false, error: "Cliente não encontrado. Ele pode ter sido excluído." };
    }

    if (parsed.success) {
      const data = parsed.data;
      // documento: valida dígitos (exceto se não mudou num cadastro antigo) e duplicidade
      if (data.document && data.document !== existing?.document) {
        const err = documentError(data.personType, data.document);
        if (err) fieldErrors.document = err;
        else {
          const dup = await db.query.customers.findFirst({
            where: and(eq(customers.document, data.document), id ? ne(customers.id, id) : undefined),
            columns: { code: true, name: true },
          });
          if (dup)
            fieldErrors.document = `Já existe um cliente com este ${data.personType === "pf" ? "CPF" : "CNPJ"}: ${formatCustomerCode(dup.code)} ${dup.name}.`;
        }
      }
      if (data.defaultTechnicianId) {
        const tech = await db.query.technicians.findFirst({
          where: eq(technicians.id, data.defaultTechnicianId),
          columns: { id: true },
        });
        if (!tech) fieldErrors.defaultTechnicianId = "Técnico não encontrado.";
      }
    }

    // primeiro local (só na criação)
    let site: z.infer<typeof siteSchema> | null = null;
    if (!id && siteHasAddress(fd, "site.")) {
      const raw = readSite(fd, "site.");
      const sp = siteSchema.safeParse({ ...raw, name: raw.name ?? "Principal" });
      if (!sp.success) Object.assign(fieldErrors, prefixed(zodFieldErrors(sp.error), "site."));
      else {
        if (!sp.data.street) fieldErrors["site.street"] = "Informe o logradouro do local.";
        if (!sp.data.city) fieldErrors["site.city"] = "Informe a cidade do local.";
        site = sp.data;
      }
    }

    if (!parsed.success || Object.keys(fieldErrors).length) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors };
    }
    const data = parsed.data;

    if (id) {
      await db
        .update(customers)
        .set({ ...data, tradeName: data.personType === "pj" ? data.tradeName : null })
        .where(eq(customers.id, id));
      revalidatePath("/admin/clientes");
      revalidatePath(`/admin/clientes/${id}`);
      return { ok: true, message: "Cliente salvo", id };
    }

    const created = await db.transaction(async (tx) => {
      const [c] = await tx.insert(customers).values(data).returning({ id: customers.id });
      if (site) {
        await tx.insert(customerSites).values({
          ...site,
          zip: site.zip ? formatCEP(site.zip) : null,
          customerId: c.id,
          isPrimary: true,
        });
      }
      return c;
    });
    revalidatePath("/admin/clientes");
    return { ok: true, message: "Cliente cadastrado", id: created.id };
  });
}

/** Desativa/reativa (cliente com histórico nunca é excluído). */
export async function setCustomerStatus(id: string, status: "ativo" | "inativo"): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const [row] = await db
      .update(customers)
      .set({ status })
      .where(eq(customers.id, id))
      .returning({ id: customers.id });
    if (!row) return { ok: false, error: "Cliente não encontrado." };
    revalidatePath("/admin/clientes");
    revalidatePath(`/admin/clientes/${id}`);
    return { ok: true, message: status === "inativo" ? "Cliente desativado" : "Cliente reativado" };
  });
}

/** Exclui apenas cadastros sem nenhum histórico (criados por engano). */
export async function deleteCustomer(id: string): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const c = await db.query.customers.findFirst({ where: eq(customers.id, id) });
    if (!c) return { ok: false, error: "Cliente não encontrado." };
    if (c.userId) return { ok: false, error: "Remova o acesso ao portal antes de excluir o cliente." };
    const [[wo], [rec], [ct], [eqp]] = await Promise.all([
      db.select({ n: count() }).from(workOrders).where(eq(workOrders.customerId, id)),
      db.select({ n: count() }).from(receivables).where(eq(receivables.customerId, id)),
      db.select({ n: count() }).from(contracts).where(eq(contracts.customerId, id)),
      db.select({ n: count() }).from(equipment).where(eq(equipment.customerId, id)),
    ]);
    if (wo.n + rec.n + ct.n + eqp.n > 0) {
      return {
        ok: false,
        error: "Este cliente tem histórico (OMs, contratos, equipamentos ou cobranças). Desative-o em vez de excluir.",
      };
    }
    await db.delete(customers).where(eq(customers.id, id));
    revalidatePath("/admin/clientes");
    return { ok: true, message: "Cliente excluído" };
  });
}

/* ---------------------------------------------------------------- Locais */

export async function saveSite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const v = formValues(fd);
    const customerId = v.str("customerId");
    const siteId = v.str("siteId");
    if (!customerId) return { ok: false, error: "Cliente não informado." };
    const customer = await db.query.customers.findFirst({ where: eq(customers.id, customerId), columns: { id: true } });
    if (!customer) return { ok: false, error: "Cliente não encontrado." };

    const parsed = siteSchema.safeParse(readSite(fd));
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const data = { ...parsed.data, zip: parsed.data.zip ? formatCEP(parsed.data.zip) : null };
    const makePrimary = v.bool("isPrimary");

    await db.transaction(async (tx) => {
      const others = await tx.query.customerSites.findMany({
        where: eq(customerSites.customerId, customerId),
        columns: { id: true, isPrimary: true },
      });
      if (siteId) {
        const current = others.find((s) => s.id === siteId);
        if (!current) throw new Error("Local não encontrado para este cliente.");
        await tx.update(customerSites).set(data).where(eq(customerSites.id, siteId));
        if (makePrimary && !current.isPrimary) await setPrimary(tx, customerId, siteId);
      } else {
        const first = others.length === 0;
        const [s] = await tx
          .insert(customerSites)
          .values({ ...data, customerId, isPrimary: false })
          .returning({ id: customerSites.id });
        if (first || makePrimary) await setPrimary(tx, customerId, s.id);
      }
    });
    revalidatePath(`/admin/clientes/${customerId}`);
    revalidatePath("/admin/clientes");
    return { ok: true, message: siteId ? "Local salvo" : "Local adicionado" };
  });
}

async function setPrimary(tx: Tx, customerId: string, siteId: string) {
  await tx.update(customerSites).set({ isPrimary: false }).where(eq(customerSites.customerId, customerId));
  await tx
    .update(customerSites)
    .set({ isPrimary: true })
    .where(and(eq(customerSites.id, siteId), eq(customerSites.customerId, customerId)));
}

export async function setPrimarySite(customerId: string, siteId: string): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const site = await db.query.customerSites.findFirst({
      where: and(eq(customerSites.id, siteId), eq(customerSites.customerId, customerId)),
      columns: { id: true },
    });
    if (!site) return { ok: false, error: "Local não encontrado para este cliente." };
    await db.transaction((tx) => setPrimary(tx, customerId, siteId));
    revalidatePath(`/admin/clientes/${customerId}`);
    revalidatePath("/admin/clientes");
    return { ok: true, message: "Local principal definido" };
  });
}

export async function deleteSite(customerId: string, siteId: string): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const site = await db.query.customerSites.findFirst({
      where: and(eq(customerSites.id, siteId), eq(customerSites.customerId, customerId)),
    });
    if (!site) return { ok: false, error: "Local não encontrado para este cliente." };
    const [[eqp], [wo]] = await Promise.all([
      db.select({ n: count() }).from(equipment).where(eq(equipment.siteId, siteId)),
      db.select({ n: count() }).from(workOrders).where(eq(workOrders.siteId, siteId)),
    ]);
    if (eqp.n > 0)
      return {
        ok: false,
        error: `Este local tem ${eqp.n} equipamento(s). Mova-os para outro local antes de excluir.`,
      };
    if (wo.n > 0) return { ok: false, error: "Este local já tem OMs registradas e não pode ser excluído." };
    await db.transaction(async (tx) => {
      await tx.delete(customerSites).where(eq(customerSites.id, siteId));
      if (site.isPrimary) {
        const next = await tx.query.customerSites.findFirst({
          where: eq(customerSites.customerId, customerId),
          columns: { id: true },
        });
        if (next) await setPrimary(tx, customerId, next.id);
      }
    });
    revalidatePath(`/admin/clientes/${customerId}`);
    revalidatePath("/admin/clientes");
    return { ok: true, message: "Local excluído" };
  });
}

/* ------------------------------------------------------- Acesso ao portal */

const passwordSchema = z
  .string({ error: "Informe a senha." })
  .min(8, "A senha precisa de pelo menos 8 caracteres.")
  .max(72, "Senha longa demais (máx. 72 caracteres).");

function authErrorMessage(e: unknown) {
  const code = (e as { body?: { code?: string } })?.body?.code ?? "";
  const msg = e instanceof Error ? e.message : "";
  if (code.includes("USER_ALREADY_EXISTS") || /already exists/i.test(msg))
    return "Já existe um acesso com este e-mail. Use outro e-mail ou remova o acesso antigo em Acessos.";
  if (code === "PASSWORD_TOO_SHORT") return "A senha é curta demais.";
  if (code === "PASSWORD_TOO_LONG") return "A senha é longa demais.";
  if (code === "INVALID_EMAIL") return "E-mail inválido.";
  if (code === "USER_NOT_FOUND") return "O usuário deste acesso não existe mais. Remova o vínculo e crie um novo acesso.";
  if (code.startsWith("YOU_ARE_NOT_ALLOWED") || code === "UNAUTHORIZED")
    return "Seu perfil não pode gerenciar acessos. Peça a um administrador.";
  return msg || "Não foi possível concluir. Tente novamente.";
}

export async function createPortalAccess(customerId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const v = formValues(fd);
    const parsed = z
      .object({ email: z.email("E-mail inválido. Confira o endereço."), password: passwordSchema })
      .safeParse({ email: v.str("email")?.toLowerCase() ?? "", password: v.str("password") ?? "" });
    if (!parsed.success) return { ok: false, error: "Revise os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };

    const customer = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
    if (!customer) return { ok: false, error: "Cliente não encontrado." };
    if (customer.userId) return { ok: false, error: "Este cliente já tem acesso ao portal." };
    const taken = await db.query.user.findFirst({ where: eq(user.email, parsed.data.email), columns: { id: true } });
    if (taken)
      return {
        ok: false,
        error: "Já existe um acesso com este e-mail.",
        fieldErrors: { email: "Este e-mail já é usado por outro acesso. Use outro e-mail." },
      };

    let userId: string;
    try {
      const res = await auth.api.createUser({
        body: {
          email: parsed.data.email,
          password: parsed.data.password,
          name: customer.tradeName || customer.name,
          role: "cliente",
        },
      });
      userId = res.user.id;
    } catch (e) {
      return { ok: false, error: authErrorMessage(e) };
    }

    const [linked] = await db
      .update(customers)
      .set({ userId })
      .where(and(eq(customers.id, customerId)))
      .returning({ id: customers.id });
    if (!linked) {
      await db.delete(user).where(eq(user.id, userId));
      return { ok: false, error: "Não foi possível vincular o acesso ao cliente." };
    }
    revalidatePath(`/admin/clientes/${customerId}`);
    revalidatePath("/admin/clientes");
    return { ok: true, message: "Acesso ao portal criado" };
  });
}

export async function resetPortalPassword(customerId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await staff();
    const parsed = passwordSchema.safeParse(formValues(fd).str("password") ?? "");
    if (!parsed.success) return { ok: false, error: "Revise a senha.", fieldErrors: { password: parsed.error.issues[0].message } };
    const customer = await db.query.customers.findFirst({ where: eq(customers.id, customerId), columns: { userId: true } });
    if (!customer?.userId) return { ok: false, error: "Este cliente ainda não tem acesso ao portal." };
    try {
      const h = await headers();
      await auth.api.setUserPassword({ body: { userId: customer.userId, newPassword: parsed.data }, headers: h });
      // encerra sessões abertas com a senha antiga
      await auth.api.revokeUserSessions({ body: { userId: customer.userId }, headers: h });
    } catch (e) {
      return { ok: false, error: authErrorMessage(e) };
    }
    revalidatePath(`/admin/clientes/${customerId}`);
    return { ok: true, message: "Senha redefinida" };
  });
}

export async function removePortalAccess(customerId: string): Promise<ActionState> {
  return runAction(async () => {
    const me = await staff();
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      with: { user: { columns: { id: true, role: true } } },
    });
    if (!customer?.userId) return { ok: false, error: "Este cliente não tem acesso ao portal." };
    if (customer.userId === me.id) return { ok: false, error: "Você não pode remover o seu próprio acesso." };

    await db.update(customers).set({ userId: null }).where(eq(customers.id, customerId));
    // Conta exclusiva de cliente: apaga o login (sessões caem junto). Outros perfis só perdem o vínculo.
    if (customer.user && (customer.user.role ?? "cliente") === "cliente") {
      try {
        await auth.api.removeUser({ body: { userId: customer.userId }, headers: await headers() });
      } catch (e) {
        await db.update(customers).set({ userId: customer.userId }).where(eq(customers.id, customerId));
        return { ok: false, error: authErrorMessage(e) };
      }
    }
    revalidatePath(`/admin/clientes/${customerId}`);
    revalidatePath("/admin/clientes");
    return { ok: true, message: "Acesso ao portal removido" };
  });
}
