import Link from "next/link";
import { Info, Undo2, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { Pager } from "@/components/system/list-controls";
import { Panel } from "@/components/system/panel";
import { PayableStatusBadge } from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { todayISO } from "@/lib/dates";
import { formatBRL, formatCompetence, formatDate } from "@/lib/format";
import { effectiveFinanceStatus } from "@/lib/labels";
import { PAGE_SIZE } from "@/lib/params";
import { cn } from "@/lib/utils";
import { undoPayout } from "../actions";
import { payoutStatus } from "../_lib/format";
import { payoutList } from "../_lib/queries";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function Fechamentos({ technicianId, page }: { technicianId?: string; page: number }) {
  const { rows, total } = await payoutList({ technicianId, page });
  const today = todayISO();
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-rime bg-night/50 px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-ice" />
        <p className="text-steel">
          Cada fechamento gera uma conta a pagar.{" "}
          <span className="text-silver">
            Ao pagar essa conta em{" "}
            <Link href="/admin/financeiro/pagar" className="text-ice hover:underline">
              Contas a pagar
            </Link>
            , o fechamento e as comissões dele passam para Paga automaticamente
          </span>{" "}
          e o técnico é avisado no app.
        </p>
      </div>

      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState
            icon={<WalletCards className="size-6 text-frost" />}
            title="Nenhum fechamento ainda"
            description="Feche a comissão de um técnico no extrato do mês para gerar o fechamento e a conta a pagar."
            action={
              <Button asChild variant="outline">
                <Link href="/admin/comissoes">Abrir extrato</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Técnico</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead className="text-right">OMs</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Conta a pagar</TableHead>
                  <TableHead className="pr-5 text-right">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const st = payoutStatus[p.status] ?? { label: p.status, tone: "steel" as const };
                  const payable = p.payableStatus && p.payableDueDate
                    ? effectiveFinanceStatus(p.payableStatus, p.payableDueDate, today)
                    : null;
                  return (
                    <TableRow key={p.id} className={cn(p.status === "cancelado" && "opacity-60")}>
                      <TableCell className="pl-5">
                        <Link
                          href={`/admin/tecnicos/${p.technicianId}`}
                          className="flex items-center gap-2 text-silver hover:text-frost"
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ background: p.technicianColor }} />
                          <span className="whitespace-nowrap">{p.technicianName}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-silver">
                        {cap(formatCompetence(p.period))}
                        <span className="block text-xs text-steel">fechado em {formatDate(p.createdAt)}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-steel">{p.entries}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-silver">
                        {formatBRL(p.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                        {p.paidAt && <span className="mt-1 block text-xs text-steel">pago em {formatDate(p.paidAt)}</span>}
                      </TableCell>
                      <TableCell>
                        {p.payableId && payable ? (
                          <Link href="/admin/financeiro/pagar" className="group inline-flex flex-col items-start gap-1">
                            <PayableStatusBadge status={payable} />
                            <span className="text-xs text-steel group-hover:text-frost">
                              {p.payableStatus === "pago" ? "ver em Contas a pagar" : `vence em ${formatDate(p.payableDueDate)}`}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-steel">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        {p.status === "aberto" && p.payableStatus !== "pago" && (
                          <ConfirmAction
                            action={undoPayout.bind(null, p.id)}
                            title="Desfazer este fechamento?"
                            description={`As ${p.entries} comissões de ${p.technicianName.split(" ")[0]} voltam a ficar liberadas para fechar de novo e a conta a pagar de ${formatBRL(p.totalAmount)} é cancelada.`}
                            confirmLabel="Desfazer fechamento"
                            destructive
                            variant="ghost"
                          >
                            <Undo2 />
                            Desfazer
                          </ConfirmAction>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pager page={page} pageSize={PAGE_SIZE} total={total} />
          </>
        )}
      </Panel>
    </div>
  );
}
