import "server-only";
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { commissionEntries, commissionPayouts, payables } from "@/db/schema";

/**
 * Desfaz um fechamento ainda não pago: as comissões voltam a ficar liberadas
 * (fora de fechamento) e a conta a pagar gerada é cancelada.
 * Candidato a ir para src/server/commissions.ts como serviço compartilhado.
 */
export async function undoCommissionPayout(tx: Tx, payoutId: string) {
  const payout = await tx.query.commissionPayouts.findFirst({
    where: eq(commissionPayouts.id, payoutId),
    with: { payable: true },
  });
  if (!payout) throw new Error("Fechamento não encontrado. Atualize a página.");
  if (payout.status !== "aberto") throw new Error("Só é possível desfazer fechamentos que ainda não foram pagos.");
  if (payout.payable?.status === "pago")
    throw new Error("A conta a pagar deste fechamento já foi paga. Estorne o pagamento em Contas a pagar antes.");

  await tx
    .update(commissionEntries)
    .set({ payoutId: null, updatedAt: new Date() })
    .where(and(eq(commissionEntries.payoutId, payoutId), eq(commissionEntries.status, "aprovada")));
  if (payout.payableId) {
    await tx
      .update(payables)
      .set({ status: "cancelado", notes: "Fechamento de comissão desfeito." })
      .where(and(eq(payables.id, payout.payableId), eq(payables.status, "aberto")));
  }
  await tx
    .update(commissionPayouts)
    .set({ status: "cancelado", notes: "Fechamento desfeito." })
    .where(eq(commissionPayouts.id, payoutId));
  return payout;
}
