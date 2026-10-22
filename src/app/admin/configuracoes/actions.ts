"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { type ActionState, formValues, runAction, zodFieldErrors } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { normalizeDocument, normalizePhone, onlyDigits } from "@/lib/format";
import { sanitizePixText } from "@/lib/pix";
import { runDaily } from "@/server/daily";
import { getSettings } from "@/server/settings";
import { cpfOrCnpjError } from "../clientes/_lib/document";

type SettingsPatch = Partial<typeof settings.$inferInsert>;

const EDITORS = ["admin", "gestor"] as const;
const UFS = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "),
);

async function save(patch: SettingsPatch, message: string): Promise<ActionState> {
  await getSettings(); // garante a linha id = 1
  await db.update(settings).set(patch).where(eq(settings.id, 1));
  revalidatePath("/admin/configuracoes");
  return { ok: true, message };
}

function invalid(error: z.ZodError): ActionState {
  return { ok: false, error: "Confira os campos destacados.", fieldErrors: zodFieldErrors(error) };
}

const optionalText = (max: number, msg: string) =>
  z
    .string()
    .max(max, msg)
    .nullable()
    .transform((v) => v || null);

const phone = z
  .string()
  .nullable()
  .transform((v) => (v ? normalizePhone(v) : null))
  .refine((v) => v == null || v.length === 10 || v.length === 11, "Use DDD + número, ex.: (11) 99999-0000.");

/* ------------------------------------------------------------------ Empresa */

const companySchema = z.object({
  companyName: z.string({ error: "Informe o nome da empresa." }).min(2, "Informe o nome da empresa.").max(120),
  document: z
    .string()
    .nullable()
    // CNPJ pode ser alfanumérico (12 caracteres + 2 dígitos verificadores)
    .transform((v) => (v ? normalizeDocument(v) || null : null))
    .refine(
      (v) => v == null || /^[0-9A-Z]{12}\d{2}$/.test(v) || /^\d{11}$/.test(v),
      "Informe um CNPJ com 14 caracteres (ou CPF com 11 dígitos).",
    ),
  phone,
  whatsapp: phone,
  email: z.email("Informe um e-mail válido.").nullable(),
  address: optionalText(200, "Endereço longo demais."),
  city: optionalText(80, "Nome da cidade longo demais."),
  state: z
    .string()
    .nullable()
    .transform((v) => (v ? v.toUpperCase() : null))
    .refine((v) => v == null || UFS.has(v), "Use a sigla do estado, ex.: SP."),
});

export async function saveCompany(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...EDITORS]);
    const f = formValues(fd);
    const parsed = companySchema.safeParse({
      companyName: f.str("companyName") ?? undefined,
      document: f.str("document"),
      phone: f.str("phone"),
      whatsapp: f.str("whatsapp"),
      email: f.str("email")?.toLowerCase() ?? null,
      address: f.str("address"),
      city: f.str("city"),
      state: f.str("state"),
    });
    if (!parsed.success) return invalid(parsed.error);
    const doc = parsed.data.document;
    if (doc && doc !== normalizeDocument((await getSettings()).document)) {
      const err = cpfOrCnpjError(doc);
      if (err) return { ok: false, error: "Confira os campos destacados.", fieldErrors: { document: err } };
    }
    const r = await save(parsed.data, "Dados da empresa salvos");
    revalidatePath("/", "layout");
    return r;
  });
}

/* ---------------------------------------------------------------------- Pix */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normaliza a chave Pix: CPF/CNPJ só dígitos, telefone +55…, e-mail minúsculo, aleatória como está. */
function normalizePixKey(raw: string): string | null {
  const v = raw.trim();
  if (UUID_RE.test(v)) return v.toLowerCase();
  if (v.includes("@")) return z.email().safeParse(v.toLowerCase()).success ? v.toLowerCase() : null;
  if (v.startsWith("+")) {
    const d = onlyDigits(v);
    return d.startsWith("55") && (d.length === 12 || d.length === 13) ? `+${d}` : null;
  }
  const d = onlyDigits(v);
  if (/^[\d.\-/\s]+$/.test(v) && (d.length === 11 || d.length === 14)) return d;
  return null;
}

const pixSchema = z.object({
  pixKey: z
    .string()
    .nullable()
    .transform((v, ctx) => {
      if (!v) return null;
      const key = normalizePixKey(v);
      if (!key) {
        ctx.addIssue({
          code: "custom",
          message: "Chave inválida. Use CPF, CNPJ, e-mail, telefone com +55 ou a chave aleatória.",
        });
        return z.NEVER;
      }
      return key;
    }),
  pixMerchantName: z
    .string()
    .nullable()
    .refine((v) => v == null || sanitizePixText(v, 99).length <= 25, "Use no máximo 25 caracteres (sem acentos)."),
  pixMerchantCity: z
    .string()
    .nullable()
    .refine((v) => v == null || sanitizePixText(v, 99).length <= 15, "Use no máximo 15 caracteres (sem acentos)."),
});

export async function savePix(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...EDITORS]);
    const f = formValues(fd);
    const parsed = pixSchema.safeParse({
      pixKey: f.str("pixKey"),
      pixMerchantName: f.str("pixMerchantName"),
      pixMerchantCity: f.str("pixMerchantCity"),
    });
    if (!parsed.success) return invalid(parsed.error);
    const d = parsed.data;
    if (d.pixKey && (!d.pixMerchantName || !d.pixMerchantCity)) {
      return {
        ok: false,
        error: "Para gerar o QR Code, informe também o nome e a cidade do recebedor.",
        fieldErrors: {
          ...(d.pixMerchantName ? {} : { pixMerchantName: "Informe o nome do recebedor." }),
          ...(d.pixMerchantCity ? {} : { pixMerchantCity: "Informe a cidade do recebedor." }),
        },
      };
    }
    const r = await save(d, d.pixKey ? "Recebimento por Pix salvo" : "Pix desativado");
    revalidatePath("/portal", "layout");
    return r;
  });
}

/* ------------------------------------------------------------------ Cobrança */

const int = (min: number, max: number, label: string) =>
  z
    .number({ error: `Informe ${label}.` })
    .int("Use um número inteiro de dias.")
    .min(min, `Use um valor entre ${min} e ${max}.`)
    .max(max, `Use um valor entre ${min} e ${max}.`);

const billingSchema = z.object({
  lateFinePercent: z.number({ error: "Informe a multa." }).min(0, "A multa não pode ser negativa.").max(20, "Multa máxima: 20%."),
  lateInterestMonthlyPercent: z
    .number({ error: "Informe os juros." })
    .min(0, "Os juros não podem ser negativos.")
    .max(10, "Juros máximos: 10% ao mês."),
  invoiceLeadDays: int(1, 60, "a antecedência"),
  serviceDueDays: int(0, 90, "o prazo"),
});

export async function saveBilling(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...EDITORS]);
    const f = formValues(fd);
    const parsed = billingSchema.safeParse({
      lateFinePercent: f.money("lateFinePercent") ?? undefined,
      lateInterestMonthlyPercent: f.money("lateInterestMonthlyPercent") ?? undefined,
      invoiceLeadDays: f.num("invoiceLeadDays") ?? undefined,
      serviceDueDays: f.num("serviceDueDays") ?? undefined,
    });
    if (!parsed.success) return invalid(parsed.error);
    return save(parsed.data, "Regras de cobrança salvas");
  });
}

/* ------------------------------------------------------- Geração automática */

const automationSchema = z.object({
  workOrderHorizonDays: int(7, 120, "o horizonte"),
  worksSaturday: z.boolean(),
  blockOverdueDays: int(0, 365, "o limite de atraso"),
});

export async function saveAutomation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...EDITORS]);
    const f = formValues(fd);
    const parsed = automationSchema.safeParse({
      workOrderHorizonDays: f.num("workOrderHorizonDays") ?? undefined,
      worksSaturday: f.bool("worksSaturday"),
      blockOverdueDays: f.num("blockOverdueDays") ?? 0,
    });
    if (!parsed.success) return invalid(parsed.error);
    return save(parsed.data, "Geração automática salva");
  });
}

/* ------------------------------------------------------------------ Comissões */

const commissionSchema = z.object({
  commissionTrigger: z.enum(["conclusao", "recebimento"], { error: "Escolha quando a comissão é liberada." }),
});

export async function saveCommission(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...EDITORS]);
    const parsed = commissionSchema.safeParse({ commissionTrigger: formValues(fd).str("commissionTrigger") ?? undefined });
    if (!parsed.success) return invalid(parsed.error);
    return save(parsed.data, "Regra de comissão salva");
  });
}

/* ---------------------------------------------------------------------- PMOC */

const pmocSchema = z.object({
  pmocResponsibleName: optionalText(120, "Nome longo demais."),
  pmocResponsibleRegistry: optionalText(60, "Registro longo demais."),
  pmocResponsibleArt: optionalText(60, "Número da ART longo demais."),
});

export async function savePmocResponsible(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole([...EDITORS]);
    const f = formValues(fd);
    const parsed = pmocSchema.safeParse({
      pmocResponsibleName: f.str("pmocResponsibleName"),
      pmocResponsibleRegistry: f.str("pmocResponsibleRegistry"),
      pmocResponsibleArt: f.str("pmocResponsibleArt"),
    });
    if (!parsed.success) return invalid(parsed.error);
    return save(parsed.data, "Responsável técnico salvo");
  });
}

/* ------------------------------------------------------------ Rotina diária */

export type DailySummary = Awaited<ReturnType<typeof runDaily>>;

export async function runDailyFromSettings(): Promise<ActionState & { summary?: DailySummary }> {
  try {
    const user = await assertRole([...EDITORS]);
    const summary = await runDaily(`manual:${user.email}`);
    revalidatePath("/admin", "layout");
    return {
      ok: true,
      summary,
      message: `Rotina executada: ${summary.oms} OM(s), ${summary.mensalidades} mensalidade(s) e ${summary.solicitacoesCompra} solicitação(ões) de compra.`,
    };
  } catch (e) {
    revalidatePath("/admin/configuracoes");
    return { ok: false, error: e instanceof Error ? `A rotina falhou: ${e.message}` : "A rotina falhou. Tente novamente." };
  }
}
