import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager, SearchInput } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ReceivableStatusBadge } from "@/components/system/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { diffDays, todayISO, toISODate } from "@/lib/dates";
import { formatBRL, formatCompetence, formatDate, formatOM } from "@/lib/format";
import { effectiveFinanceStatus, labelOf, paymentMethod } from "@/lib/labels";
import { PAGE_SIZE, pageFrom, param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { getSettings } from "@/server/settings";
import { TotalsBar } from "../_components/totals-bar";
import { MonthFilter, ParamSelect } from "../_components/url-filters";
import { RECEIVABLE_KINDS, isMonth } from "../_lib/constants";
import {
  RECEIVABLE_TABS,
  financeOptions,
  listReceivables,
  proofsPendingCount,
  type ReceivableRow,
  type ReceivableTab,
} from "../_lib/queries";
import { GenerateInvoicesButton } from "./_components/generate-invoices-button";
import { NewReceivableDialog } from "./_components/new-receivable-dialog";
import { ReceivableActions, type PixConfig, type ReceivableActionRow } from "./_components/receivable-actions";
import { ReceivableDialogsProvider } from "./_components/receivable-dialogs";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Contas a receber" };

const kindShort: Record<string, string> = { mensalidade: "Mensalidade", servico: "Serviço avulso", outro: "Outra receita" };

export default async function ReceivablesPage({ searchParams }: PageProps<"/admin/financeiro/receber">) {
  await requireStaff();
  const sp = await searchParams;
  const today = todayISO();
  const rawTab = param(sp, "status") ?? "";
  const tab: ReceivableTab = (RECEIVABLE_TABS as readonly string[]).includes(rawTab) ? (rawTab as ReceivableTab) : "";
  const rawMonth = param(sp, "mes");
  const month = isMonth(rawMonth) ? rawMonth : undefined;
  const kind = param(sp, "tipo");
  const q = param(sp, "q")?.trim().slice(0, 80);
  const page = pageFrom(sp);

  const [{ rows, totals, counts }, options, settings, pendingProofs] = await Promise.all([
    listReceivables({ tab, month, kind, q, page }, today),
    financeOptions(),
    getSettings(),
    proofsPendingCount(),
  ]);

  const late = { finePercent: settings.lateFinePercent, interestMonthlyPercent: settings.lateInterestMonthlyPercent };
  const pix: PixConfig = settings.pixKey
    ? {
        key: settings.pixKey,
        merchantName: settings.pixMerchantName || settings.companyName,
        merchantCity: settings.pixMerchantCity || settings.city || "Sao Paulo",
      }
    : null;
  const filtered = Boolean(month || kind || q);

  const actionProps = { today, late, pix, companyName: settings.companyName };

  return (
    <>
      <PageHeader
        title="Contas a receber"
        description="Mensalidades e serviços avulsos. Confira comprovantes, dê baixa nos pagamentos e cobre pelo WhatsApp."
        actions={
          <>
            <GenerateInvoicesButton />
            <NewReceivableDialog customers={options.customers} categories={options.revenueCategories} today={today} />
          </>
        }
      />

      {pendingProofs > 0 && tab !== "em_analise" && (
        <Link
          href="/admin/financeiro/receber?status=em_analise"
          className="mb-5 flex items-center gap-3 rounded-xl bg-brass/8 px-4 py-3 ring-1 ring-brass/30 transition-colors hover:bg-brass/12"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brass/15 text-brass">
            <FileSearch className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium text-silver">
              {pendingProofs === 1 ? "1 comprovante aguardando conferência" : `${pendingProofs} comprovantes aguardando conferência`}
            </span>
            <span className="block text-steel">Clientes enviaram pelo portal. Confira o valor e confirme ou recuse.</span>
          </span>
          <span className="hidden shrink-0 text-sm font-medium text-brass sm:inline">Conferir comprovantes</span>
        </Link>
      )}

      <div className="mb-4 space-y-3">
        <FilterTabs
          options={[
            { value: "", label: "Em aberto", count: counts.aberto },
            { value: "vencido", label: "Vencidas", count: counts.vencido },
            { value: "em_analise", label: "Comprovantes em análise", count: counts.em_analise },
            { value: "pago", label: "Pagas", count: counts.pago },
            { value: "cancelado", label: "Canceladas", count: counts.cancelado },
            { value: "todas", label: "Todas", count: counts.todas },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput placeholder="Buscar cliente ou descrição" />
          <MonthFilter current={today.slice(0, 7)} optional />
          <ParamSelect
            param="tipo"
            label="Tipo de receita"
            placeholder="Todos os tipos"
            options={RECEIVABLE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          />
        </div>
      </div>

      <ReceivableDialogsProvider today={today} late={late} bankAccounts={options.bankAccounts}>
        <Panel flush>
          {rows.length === 0 ? (
            <ReceivablesEmpty tab={tab} filtered={filtered} />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-rime hover:bg-transparent">
                      <TableHead className="pl-5">Vencimento</TableHead>
                      <TableHead>Cliente e descrição</TableHead>
                      <TableHead className="hidden xl:table-cell">Competência</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="pr-5 text-right">
                        <span className="sr-only">Ações</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const eff = effectiveFinanceStatus(r.status, r.dueDate, today);
                      return (
                        <TableRow key={r.id} className={cn("border-rime", eff === "em_analise" && "bg-brass/[0.04]")}>
                          <TableCell className="pl-5 align-top">
                            <DueDate dueDate={r.dueDate} overdue={eff === "vencido"} today={today} />
                          </TableCell>
                          <TableCell className="max-w-[22rem] align-top whitespace-normal">
                            <CustomerCell row={r} />
                          </TableCell>
                          <TableCell className="hidden align-top text-sm text-steel xl:table-cell">
                            {r.competence ? formatCompetence(r.competence) : "—"}
                          </TableCell>
                          <TableCell className="align-top text-right tabular-nums">
                            <Amount row={r} />
                          </TableCell>
                          <TableCell className="align-top whitespace-normal">
                            <Situation row={r} status={eff} />
                          </TableCell>
                          <TableCell className="pr-5 align-top">
                            <ReceivableActions row={actionRow(r)} {...actionProps} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <ul className="divide-y divide-rime md:hidden">
                {rows.map((r) => {
                  const eff = effectiveFinanceStatus(r.status, r.dueDate, today);
                  return (
                    <li key={r.id} className={cn("space-y-3 px-4 py-4", eff === "em_analise" && "bg-brass/[0.04]")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CustomerCell row={r} />
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <Amount row={r} />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 text-sm">
                        <div>
                          <span className="text-xs text-steel">Vencimento</span>
                          <DueDate dueDate={r.dueDate} overdue={eff === "vencido"} today={today} />
                        </div>
                        <div className="text-right">
                          <Situation row={r} status={eff} />
                        </div>
                      </div>
                      <ReceivableActions row={actionRow(r)} {...actionProps} compact />
                    </li>
                  );
                })}
              </ul>

              <TotalsBar
                items={[
                  { label: totals.count === 1 ? "1 conta" : `${totals.count} contas`, value: null },
                  { label: "Valor", value: totals.amount },
                  ...(totals.open > 0 ? [{ label: "Em aberto", value: totals.open }] : []),
                  ...(totals.paid > 0 ? [{ label: "Recebido", value: totals.paid, tone: "text-mint" }] : []),
                ]}
              />
              <Pager page={page} pageSize={PAGE_SIZE} total={totals.count} />
            </>
          )}
        </Panel>
      </ReceivableDialogsProvider>
    </>
  );
}

function actionRow(r: ReceivableRow): ReceivableActionRow {
  return {
    id: r.id,
    description: r.description,
    customerName: r.customerName,
    dueDate: r.dueDate,
    amount: r.amount,
    discount: r.discount,
    status: r.status,
    paymentMethod: r.paymentMethod,
    proofDate: r.proofSentAt ? toISODate(r.proofSentAt) : null,
    proofUrl: r.proofUrl,
    proofSentAt: r.proofSentAt,
    pixTxid: r.pixTxid,
    customerWhatsapp: r.customerWhatsapp,
    customerPhone: r.customerPhone,
  };
}

function DueDate({ dueDate, overdue, today }: { dueDate: string; overdue: boolean; today: string }) {
  const days = diffDays(dueDate, today);
  return (
    <div className="tabular-nums">
      <span className={cn("block text-sm", overdue ? "font-medium text-gauge-red" : "text-silver")}>{formatDate(dueDate)}</span>
      {overdue && <span className="block text-xs text-gauge-red/80">{days === 1 ? "há 1 dia" : `há ${days} dias`}</span>}
      {!overdue && days === 0 && <span className="block text-xs text-brass">vence hoje</span>}
    </div>
  );
}

function CustomerCell({ row }: { row: ReceivableRow }) {
  return (
    <div className="min-w-0">
      {row.customerId && row.customerName ? (
        <Link href={`/admin/clientes/${row.customerId}`} className="block truncate text-sm font-medium text-silver hover:text-frost">
          {row.customerName}
        </Link>
      ) : (
        <span className="block text-sm text-steel">Sem cliente</span>
      )}
      <span className="mt-0.5 block text-sm text-steel md:line-clamp-1" title={row.description}>
        {row.description}
      </span>
      {(row.kind !== "mensalidade" || row.workOrderId) && (
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-steel/80">
          {row.kind !== "mensalidade" && <span>{kindShort[row.kind] ?? row.kind}</span>}
          {row.workOrderId && row.workOrderNumber != null && (
            <Link href={`/admin/oms/${row.workOrderId}`} className="text-ice hover:text-frost">
              {formatOM(row.workOrderNumber)}
            </Link>
          )}
        </span>
      )}
    </div>
  );
}

function Amount({ row }: { row: ReceivableRow }) {
  return (
    <>
      <span className="block text-sm font-medium text-silver">{formatBRL(row.amount - row.discount)}</span>
      {row.discount > 0 && <span className="block text-xs text-steel">desconto de {formatBRL(row.discount)}</span>}
    </>
  );
}

function Situation({ row, status }: { row: ReceivableRow; status: string }) {
  const method = row.paymentMethod ? labelOf(paymentMethod, row.paymentMethod).label : null;
  return (
    <div className="space-y-1">
      <ReceivableStatusBadge status={status} />
      {row.status === "pago" && (
        <p className="text-xs text-steel">
          {method ? `${method} em ` : "Pago em "}
          {formatDate(row.paidAt)}
          {row.paidAmount != null && (
            <span className="block tabular-nums text-silver/90">
              {formatBRL(row.paidAmount)}
              {row.fine + row.interest > 0 && <span className="text-steel"> com {formatBRL(row.fine + row.interest)} de multa e juros</span>}
            </span>
          )}
          {row.bankAccountName && <span className="block">{row.bankAccountName}</span>}
        </p>
      )}
      {row.status === "em_analise" && (
        <p className="text-xs text-steel">
          Enviado em {formatDate(row.proofSentAt)}
          {method ? ` por ${method}` : ""}
        </p>
      )}
      {row.status === "aberto" && row.notes && (
        <p className="max-w-56 text-xs text-steel" title={row.notes}>
          <span className="line-clamp-2">{row.notes}</span>
        </p>
      )}
    </div>
  );
}

function ReceivablesEmpty({ tab, filtered }: { tab: ReceivableTab; filtered: boolean }) {
  if (filtered)
    return (
      <EmptyState
        title="Nenhuma conta com esses filtros"
        description="Troque o mês, o tipo ou a busca para ver outras contas."
        action={
          <Link href={`/admin/financeiro/receber${tab ? `?status=${tab}` : ""}`} className="text-sm text-ice hover:text-frost">
            Limpar filtros
          </Link>
        }
      />
    );
  const copy: Record<string, { title: string; description: string }> = {
    "": {
      title: "Nada em aberto para receber",
      description: "Todas as contas estão pagas. Gere as mensalidades do próximo período ou lance uma cobrança avulsa.",
    },
    vencido: { title: "Nenhuma conta vencida", description: "Todos os clientes estão em dia." },
    em_analise: {
      title: "Nenhum comprovante para conferir",
      description: "Quando um cliente enviar o comprovante pelo portal, ele aparece aqui para você confirmar.",
    },
    pago: { title: "Nenhum pagamento registrado", description: "Os pagamentos confirmados aparecem aqui." },
    cancelado: { title: "Nenhuma conta cancelada", description: "Contas canceladas saem da cobrança e aparecem aqui." },
    todas: { title: "Nenhuma conta a receber ainda", description: "Gere as mensalidades dos contratos ou lance uma cobrança avulsa." },
  };
  const c = copy[tab] ?? copy[""];
  return <EmptyState title={c.title} description={c.description} />;
}
