"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { commissionRules, technicians } from "@/db/schema";
import { type ActionState, formValues, runAction, zodFieldErrors } from "@/lib/action";
import { assertRole } from "@/lib/auth/session";
import { competenceOf, todayISO } from "@/lib/dates";
import { formatBRL, formatCompetence } from "@/lib/format";
import { closeCommissionPayout } from "@/server/commissions";
import { undoCommissionPayout } from "./_lib/payouts";

const STAFF: ("admin" | "gestor")[] = ["admin", "gestor"];
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

function revalidateCommissions(technicianId?: string) {
  revalidatePath("/admin/comissoes");
  revalidatePath("/admin/financeiro");
  revalidatePath("/admin/financeiro/pagar");
  revalidatePath("/admin/tecnicos");
  if (technicianId) revalidatePath(`/admin/tecnicos/${technicianId}`);
  revalidatePath("/tecnico/ganhos");
}

/* ───────────────────────── fechamento ───────────────────────── */

export async function closePayout(technicianId: string, period: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    if (!PERIOD.test(period)) return { ok: false, error: "Período inválido. Escolha o mês no seletor do extrato." };
    if (period > competenceOf(todayISO()))
      return { ok: false, error: "Escolha um mês até o atual para fechar a comissão." };
    const tech = await db.query.technicians.findFirst({ where: eq(technicians.id, technicianId) });
    if (!tech) return { ok: false, error: "Técnico não encontrado." };

    const result = await db.transaction((tx) => closeCommissionPayout(tx, { technicianId, period }));
    revalidateCommissions(technicianId);
    return {
      ok: true,
      id: result.payout.id,
      message: `Comissão fechada: ${formatBRL(result.total)} para ${tech.name.split(" ")[0]} em ${result.count} OM${result.count > 1 ? "s" : ""}. Conta a pagar criada.`,
    };
  });
}

export async function undoPayout(payoutId: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const payout = await db.transaction((tx) => undoCommissionPayout(tx, payoutId));
    revalidateCommissions(payout.technicianId);
    return { ok: true, message: `Fechamento de ${formatCompetence(payout.period)} desfeito. Conta a pagar cancelada.` };
  });
}

/* ───────────────────────── regras ───────────────────────── */

const BASES = ["percentual_mao_de_obra", "percentual_total", "percentual_materiais", "fixo_por_om"] as const;
const TYPES = ["preventiva", "corretiva", "instalacao", "visita_tecnica", "pmoc"] as const;

const ruleSchema = z
  .object({
    name: z.string().trim().min(3, "Dê um nome à regra (ex.: Corretivas — 12% do total)."),
    technicianId: z.uuid("Técnico inválido.").nullable(),
    workOrderType: z.enum(TYPES, "Tipo de OM inválido.").nullable(),
    basis: z.enum(BASES, "Escolha a base de cálculo."),
    rate: z.number("Informe a taxa.").positive("A taxa precisa ser maior que zero."),
    priority: z
      .number("Prioridade inválida.")
      .int("Use um número inteiro na prioridade.")
      .min(-100, "Use uma prioridade entre -100 e 100.")
      .max(100, "Use uma prioridade entre -100 e 100."),
    active: z.boolean(),
  })
  .refine((r) => r.basis === "fixo_por_om" || r.rate <= 100, {
    path: ["rate"],
    message: "Percentual acima de 100%. Confira a taxa.",
  });

export async function saveRule(ruleId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const f = formValues(fd);
    const parsed = ruleSchema.safeParse({
      name: f.str("name") ?? "",
      technicianId: f.str("technicianId"),
      workOrderType: f.str("workOrderType"),
      basis: f.str("basis"),
      rate: f.money("rate"),
      priority: f.num("priority") ?? 0,
      active: f.bool("active"),
    });
    if (!parsed.success)
      return { ok: false, error: "Confira os campos destacados.", fieldErrors: zodFieldErrors(parsed.error) };
    const data = parsed.data;
    if (data.technicianId) {
      const tech = await db.query.technicians.findFirst({ where: eq(technicians.id, data.technicianId), columns: { id: true } });
      if (!tech) return { ok: false, error: "Técnico não encontrado.", fieldErrors: { technicianId: "Escolha outro técnico." } };
    }
    if (ruleId) {
      const [row] = await db.update(commissionRules).set(data).where(eq(commissionRules.id, ruleId)).returning({ id: commissionRules.id });
      if (!row) return { ok: false, error: "Regra não encontrada. Atualize a página." };
    } else {
      await db.insert(commissionRules).values(data);
    }
    revalidatePath("/admin/comissoes");
    return { ok: true, message: ruleId ? "Regra salva" : "Regra criada" };
  });
}

export async function setRuleActive(ruleId: string, active: boolean): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const [row] = await db
      .update(commissionRules)
      .set({ active })
      .where(eq(commissionRules.id, ruleId))
      .returning({ name: commissionRules.name });
    if (!row) return { ok: false, error: "Regra não encontrada. Atualize a página." };
    revalidatePath("/admin/comissoes");
    return { ok: true, message: active ? `Regra "${row.name}" ativada` : `Regra "${row.name}" desativada` };
  });
}

export async function deleteRule(ruleId: string): Promise<ActionState> {
  return runAction(async () => {
    await assertRole(STAFF);
    const [row] = await db.delete(commissionRules).where(eq(commissionRules.id, ruleId)).returning({ name: commissionRules.name });
    if (!row) return { ok: false, error: "Regra não encontrada. Atualize a página." };
    revalidatePath("/admin/comissoes");
    return { ok: true, message: `Regra "${row.name}" excluída` };
  });
}
