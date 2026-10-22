import Link from "next/link";
import { Lock, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { Pager } from "@/components/system/list-controls";
import { Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { CommissionStatusBadge } from "@/components/system/status";
import { ToneBadge, toneText } from "@/components/system/tone-badge";
import { formatBRL, formatCompetence, formatDate, formatOM } from "@/lib/format";
import { commissionBasis, labelOf, workOrderType } from "@/lib/labels";
import { PAGE_SIZE } from "@/lib/params";
import { cn } from "@/lib/utils";
import { TechAvatar } from "../../tecnicos/_components/tech-avatar";
import { closePayout } from "../actions";
import { formatRate, payoutStatus } from "../_lib/format";
import { statement, summaryByTechnician, type TechSummary } from "../_lib/queries";

export async function Extrato({
  period,
  current,
  technicianId,
  page,
}: {
  period: string;
  current: string;
  technicianId?: string;
  page: number;
}) {
  const [{ rows, total, totals }, summary] = await Promise.all([
    statement({ period, technicianId, page }),
    summaryByTechnician(period, technicianId),
  ]);
  const t = (k: string) => totals[k] ?? { count: 0, amount: 0, inPayout: 0 };
  const validCount = t("pendente").count + t("aprovada").count + t("paga").count;
  const validAmount = t("pendente").amount + t("aprovada").amount + t("paga").amount;
  const monthLabel = formatCompetence(period);

  return (
    <div className="space-y-6">
      <ReadoutBand
        className="[&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1"
        items={[
          {
            label: "Total do período",
            value: validAmount,
            format: "brl",
            hint: `${validCount} comiss${validCount === 1 ? "ão" : "ões"} em ${monthLabel}`,
          },
          {
            label: "Previstas",
            value: t("pendente").amount,
            format: "brl",
            tone: "frost",
            // no claro o frost fica mais escuro que o ice: previsto em tinta secundária, abaixo do liberado
            valueClassName: "light:text-steel",
            hint: "aguardam o pagamento do cliente",
          },
          {
            label: "Liberadas",
            value: t("aprovada").amount,
            format: "brl",
            tone: "ice",
            hint:
              t("aprovada").inPayout > 0
                ? `${formatBRL(t("aprovada").inPayout)} já em fechamento`
                : "prontas para fechar",
          },
          { label: "Pagas", value: t("paga").amount, format: "brl", tone: "mint", hint: `${t("paga").count} lançamentos` },
          {
            label: "Canceladas",
            value: t("cancelada").amount,
            format: "brl",
            tone: "steel",
            hint: t("cancelada").count ? "OMs reabertas ou canceladas" : "nenhuma no período",
          },
        ]}
      />

      <Panel
        flush
        title="Fechamento por técnico"
        description="Fechar agrupa as comissões liberadas até este mês, ainda fora de fechamento, e cria a conta a pagar."
      >
        {summary.length === 0 ? (
          <EmptyState title="Nenhum técnico com comissões" description="Cadastre técnicos e regras de comissão para começar." />
        ) : (
          <ul className="divide-y divide-rime">
            {summary.map((s) => (
              <SummaryRow key={s.id} s={s} period={period} current={current} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        flush
        title="Lançamentos"
        description={`Uma comissão por OM concluída em ${monthLabel}.`}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-6 text-frost" />}
            title={`Nenhuma comissão em ${monthLabel}`}
            description="As comissões são calculadas quando uma OM é concluída. Veja outro mês ou confira as regras."
            action={
              <Button asChild variant="outline">
                <Link href="/admin/comissoes?tab=regras">Ver regras de comissão</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Data</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>OM</TableHead>
                  <TableHead>Base de cálculo</TableHead>
                  <TableHead className="text-right">Valor base</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="pr-5">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const type = labelOf(workOrderType, r.type);
                  return (
                    <TableRow key={r.id} className={cn(r.status === "cancelada" && "opacity-60")}>
                      <TableCell className="pl-5 tabular-nums text-steel">{formatDate(r.finishedAt)}</TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/tecnicos/${r.technicianId}`}
                          className="flex items-center gap-2 text-silver hover:text-frost"
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ background: r.technicianColor }} />
                          <span className="whitespace-nowrap">{r.technicianName}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {r.number != null ? (
                          <Link href={`/admin/oms/${r.workOrderId}`} className="group block">
                            <span className="readout text-sm text-ice group-hover:underline">{formatOM(r.number)}</span>
                            <span className={cn("block text-xs", toneText[type.tone])}>{type.label}</span>
                          </Link>
                        ) : (
                          <span className="text-steel">OM removida</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-steel">
                        {commissionBasis[r.basis]?.label ?? r.basis}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-steel">
                        {r.basis === "fixo_por_om" ? "—" : formatBRL(r.baseAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-steel">{formatRate(r.basis, r.rate)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-silver">{formatBRL(r.amount)}</TableCell>
                      <TableCell className="pr-5">
                        <div className="flex items-center gap-2">
                          <CommissionStatusBadge status={r.status} />
                          {r.payoutId && r.status === "aprovada" && (
                            <span title="Já incluída em um fechamento" className="inline-flex items-center gap-1 text-xs text-steel">
                              <Lock className="size-3" />
                              fechada
                            </span>
                          )}
                        </div>
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

function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cn("tabular-nums", value ? "text-silver" : "text-steel/60 light:text-steel", className)}>{formatBRL(value)}</span>;
}

function SummaryRow({ s, period, current }: { s: TechSummary; period: string; current: string }) {
  const first = s.name.split(" ")[0];
  const openPayout = s.payouts.find((p) => p.status === "aberto");
  const paidPayout = s.payouts.find((p) => p.status === "pago");
  const description = [
    `${s.toCloseCount} comiss${s.toCloseCount === 1 ? "ão liberada" : "ões liberadas"}, total de ${formatBRL(s.toClose)}`,
    s.toCloseEarlier > 0 ? `, incluindo ${formatBRL(s.toCloseEarlier)} de meses anteriores ainda não fechados` : "",
    ". Uma conta a pagar com vencimento em 5 dias será criada em Contas a pagar.",
    period === current ? " O mês ainda não terminou: o que for liberado depois entra no próximo fechamento." : "",
  ].join("");

  return (
    <li className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.8fr))_minmax(0,1.3fr)_11.5rem] md:items-center md:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <TechAvatar name={s.name} color={s.color} size="sm" muted={!s.active} />
        <div className="min-w-0">
          <Link href={`/admin/tecnicos/${s.id}`} className="block truncate font-medium text-silver hover:text-frost">
            {s.name}
          </Link>
          <p className="text-xs text-steel">
            {s.count} OM{s.count === 1 ? "" : "s"} com comissão
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-3 md:contents">
        <div className="md:text-right">
          <dt className="text-[0.7rem] text-steel">Previstas</dt>
          <dd className="text-sm">
            <Money value={s.pending} />
          </dd>
        </div>
        <div className="md:text-right">
          <dt className="text-[0.7rem] text-steel">Liberadas</dt>
          <dd className="text-sm">
            <Money value={s.released} />
          </dd>
        </div>
        <div className="md:text-right">
          <dt className="text-[0.7rem] text-steel">Pagas</dt>
          <dd className="text-sm">
            <Money value={s.paid} />
          </dd>
        </div>
        <div className="col-span-3 flex items-baseline justify-between gap-3 rounded-lg bg-night/50 px-3 py-2 ring-1 ring-rime md:col-span-1 md:block md:bg-transparent md:p-0 md:text-right md:ring-0">
          <dt className="text-[0.7rem] text-steel">A fechar</dt>
          <dd className="text-right text-sm">
            <Money value={s.toClose} className={s.toClose ? "font-semibold text-ice" : undefined} />
            {s.toCloseEarlier > 0 && (
              <span className="block text-[0.7rem] text-steel">inclui {formatBRL(s.toCloseEarlier)} anteriores</span>
            )}
          </dd>
        </div>
      </dl>
      <div className="flex justify-start md:justify-end">
        {s.toClose > 0 ? (
          <ConfirmAction
            action={closePayout.bind(null, s.id, period)}
            title={`Fechar a comissão de ${first} até ${formatCompetence(period)}?`}
            description={description}
            confirmLabel={`Fechar ${formatBRL(s.toClose)}`}
            variant="default"
          >
            Fechar comissão
          </ConfirmAction>
        ) : openPayout || paidPayout ? (
          <Link href="/admin/comissoes?tab=fechamentos" className="inline-flex">
            <ToneBadge tone={payoutStatus[(openPayout ?? paidPayout)!.status].tone}>
              {openPayout ? "Aguardando pagamento" : "Fechada e paga"}
            </ToneBadge>
          </Link>
        ) : (
          <span className="text-xs text-steel">Nada a fechar</span>
        )}
      </div>
    </li>
  );
}
