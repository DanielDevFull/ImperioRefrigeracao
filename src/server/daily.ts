import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns, settings } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { generateInvoices } from "./billing";
import { generateWorkOrders } from "./scheduler";
import { getSettings } from "./settings";
import { ensureForecastRequests, ensureReorderRequests } from "./stock";

/**
 * Rotina diária: mensalidades → OMs preventivas → reposição de estoque.
 * Executada pelo Vercel Cron e pelo botão "Rodar rotina agora".
 */
export async function runDaily(triggeredBy: string) {
  const today = todayISO();
  const [run] = await db.insert(jobRuns).values({ job: "diario", triggeredBy }).returning();
  try {
    const invoices = await generateInvoices({ today });
    const workOrders = await generateWorkOrders({ today });
    const s = await getSettings();
    const reorder = await ensureReorderRequests(db);
    const forecast = await ensureForecastRequests(db, s.workOrderHorizonDays, today);
    const summary = {
      mensalidades: invoices.created,
      oms: workOrders.created,
      equipamentosVerificados: workOrders.equipmentChecked,
      bloqueadosPorInadimplencia: workOrders.blockedByOverdue,
      omsSemTecnico: workOrders.withoutTechnician,
      solicitacoesCompra: reorder + forecast,
      erros: workOrders.errors,
    };
    await db
      .update(jobRuns)
      .set({ finishedAt: new Date(), ok: workOrders.errors.length === 0, summary: JSON.stringify(summary) })
      .where(eq(jobRuns.id, run.id));
    await db.update(settings).set({ lastDailyRunAt: new Date() }).where(eq(settings.id, 1));
    return summary;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, summary: message }).where(eq(jobRuns.id, run.id));
    throw e;
  }
}
