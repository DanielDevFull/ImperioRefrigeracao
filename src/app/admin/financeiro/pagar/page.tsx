import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager, SearchInput } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { PayableStatusBadge } from "@/components/system/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { diffDays, todayISO } from "@/lib/dates";
import { formatBRL, formatCompetence, formatDate, formatPO } from "@/lib/format";
import { effectiveFinanceStatus, labelOf, paymentMethod } from "@/lib/labels";
import { PAGE_SIZE, pageFrom, param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { TotalsBar } from "../_components/totals-bar";
import { MonthFilter, ParamSelect } from "../_components/url-filters";
import { isMonth } from "../_lib/constants";
import { PAYABLE_TABS, financeOptions, listPayables, type PayableRow, type PayableTab } from "../_lib/queries";
import { NewPayableDialog } from "./_components/new-payable-dialog";
import { PayDialogProvider, PayableActions, type PayableActionRow } from "./_components/payable-actions";

export const metadata: Metadata = { title: "Contas a pagar" };

export default async function PayablesPage({ searchParams }: PageProps<"/admin/financeiro/pagar">) {
  const sp = await searchParams;
  const today = todayISO();
  const rawTab = param(sp, "status") ?? "";
  const tab: PayableTab = (PAYABLE_TABS as readonly string[]).includes(rawTab) ? (rawTab as PayableTab) : "";
  const rawMonth = param(sp, "mes");
  const month = isMonth(rawMonth) ? rawMonth : undefined;
  const categoryId = param(sp, "categoria");
  const supplierId = param(sp, "fornecedor");
  const q = param(sp, "q")?.trim().slice(0, 80);
  const page = pageFrom(sp);

  const [{ rows, totals, counts }, options] = await Promise.all([
    listPayables({ tab, month, categoryId, supplierId, q, page }, today),
    financeOptions(),
  ]);
  const filtered = Boolean(month || categoryId || supplierId || q);
  const expenseCategoriesAll = options.categories.filter((c) => c.type === "despesa");

  return (
    <>
      <PageHeader
        title="Contas a pagar"
        description="Fornecedores, folha, impostos e comissões. Registre os pagamentos e acompanhe o que vence."
        actions={<NewPayableDialog suppliers={options.suppliers} categories={options.expenseCategories} today={today} />}
      />

      <div className="mb-4 space-y-3">
        <FilterTabs
          options={[
            { value: "", label: "Em aberto", count: counts.aberto },
            { value: "vencido", label: "Vencidas", count: counts.vencido },
            { value: "pago", label: "Pagas", count: counts.pago },
            { value: "cancelado", label: "Canceladas", count: counts.cancelado },
            { value: "todas", label: "Todas", count: counts.todas },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput placeholder="Buscar descrição ou documento" />
          <MonthFilter current={today.slice(0, 7)} optional />
          <ParamSelect
            param="categoria"
            label="Categoria"
            placeholder="Todas as categorias"
            options={expenseCategoriesAll.map((c) => ({ value: c.id, label: c.active ? c.name : `${c.name} (inativa)` }))}
          />
          <ParamSelect
            param="fornecedor"
            label="Fornecedor"
            placeholder="Todos os fornecedores"
            options={options.suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
      </div>

      <PayDialogProvider today={today} bankAccounts={options.bankAccounts}>
        <Panel flush>
          {rows.length === 0 ? (
            <PayablesEmpty tab={tab} filtered={filtered} />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-rime hover:bg-transparent">
                      <TableHead className="pl-5">Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="hidden lg:table-cell">Fornecedor</TableHead>
                      <TableHead className="hidden xl:table-cell">Categoria</TableHead>
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
                        <TableRow key={r.id} className="border-rime">
                          <TableCell className="pl-5 align-top">
                            <DueDate dueDate={r.dueDate} overdue={eff === "vencido"} today={today} />
                          </TableCell>
                          <TableCell className="max-w-[22rem] align-top whitespace-normal">
                            <DescriptionCell row={r} />
                          </TableCell>
                          <TableCell className="hidden align-top text-sm lg:table-cell">
                            {r.supplierName ? (
                              <Link href={`/admin/fornecedores?q=${encodeURIComponent(r.supplierName)}`} className="text-silver hover:text-frost">
                                {r.supplierName}
                              </Link>
                            ) : (
                              <span className="text-steel">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden align-top xl:table-cell">
                            <CategoryLabel name={r.categoryName} color={r.categoryColor} />
                          </TableCell>
                          <TableCell className="align-top text-right text-sm font-medium tabular-nums text-silver">
                            {formatBRL(r.amount)}
                          </TableCell>
                          <TableCell className="align-top whitespace-normal">
                            <Situation row={r} status={eff} />
                          </TableCell>
                          <TableCell className="pr-5 align-top">
                            <PayableActions row={actionRow(r)} />
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
                    <li key={r.id} className="space-y-3 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <DescriptionCell row={r} showSupplier />
                        </div>
                        <span className="shrink-0 text-sm font-medium tabular-nums text-silver">{formatBRL(r.amount)}</span>
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
                      <PayableActions row={actionRow(r)} compact />
                    </li>
                  );
                })}
              </ul>

              <TotalsBar
                items={[
                  { label: totals.count === 1 ? "1 conta" : `${totals.count} contas`, value: null },
                  { label: "Valor", value: totals.amount },
                  ...(totals.open > 0 ? [{ label: "Em aberto", value: totals.open }] : []),
                  ...(totals.paid > 0 ? [{ label: "Pago", value: totals.paid }] : []),
                ]}
              />
              <Pager page={page} pageSize={PAGE_SIZE} total={totals.count} />
            </>
          )}
        </Panel>
      </PayDialogProvider>
    </>
  );
}

function actionRow(r: PayableRow): PayableActionRow {
  return {
    id: r.id,
    description: r.description,
    supplierName: r.supplierName,
    dueDate: r.dueDate,
    amount: r.amount,
    status: r.status,
    attachmentUrl: r.attachmentUrl,
    commissionPayoutId: r.commissionPayoutId,
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

function CategoryLabel({ name, color }: { name: string | null; color: string | null }) {
  if (!name) return <span className="text-sm text-steel">Sem categoria</span>;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-silver/90">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color ?? "#8da2bf" }} aria-hidden />
      {name}
    </span>
  );
}

function DescriptionCell({ row, showSupplier = false }: { row: PayableRow; showSupplier?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="block text-sm font-medium text-silver">{row.description}</span>
      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel">
        {row.supplierName && (
          <span className={cn(!showSupplier && "lg:hidden")}>{row.supplierName}</span>
        )}
        <span className={cn(!showSupplier && "xl:hidden")}>
          <CategoryLabel name={row.categoryName} color={row.categoryColor} />
        </span>
        {row.documentNumber && <span>Doc. {row.documentNumber}</span>}
        {row.purchaseOrderId && (
          <Link href={`/admin/compras/pedidos/${row.purchaseOrderId}`} className="text-ice hover:text-frost">
            Pedido {row.purchaseOrderNumber != null ? formatPO(row.purchaseOrderNumber) : "de compra"}
          </Link>
        )}
        {row.commissionPayoutId && (
          <Link href="/admin/comissoes" className="text-ice hover:text-frost" title={[row.payoutTechnician, row.payoutPeriod ? formatCompetence(row.payoutPeriod) : null].filter(Boolean).join(", ")}>
            Fechamento de comissão
          </Link>
        )}
      </span>
    </div>
  );
}

function Situation({ row, status }: { row: PayableRow; status: string }) {
  const method = row.paymentMethod ? labelOf(paymentMethod, row.paymentMethod).label : null;
  return (
    <div className="space-y-1">
      <PayableStatusBadge status={status} />
      {row.status === "pago" && (
        <p className="text-xs text-steel">
          {method ? `${method} em ` : "Pago em "}
          {formatDate(row.paidAt)}
          {row.paidAmount != null && row.paidAmount !== row.amount && (
            <span className="block tabular-nums text-silver/90">{formatBRL(row.paidAmount)} pagos</span>
          )}
          {row.bankAccountName && <span className="block">{row.bankAccountName}</span>}
        </p>
      )}
    </div>
  );
}

function PayablesEmpty({ tab, filtered }: { tab: PayableTab; filtered: boolean }) {
  if (filtered)
    return (
      <EmptyState
        title="Nenhuma conta com esses filtros"
        description="Troque o mês, a categoria, o fornecedor ou a busca para ver outras contas."
        action={
          <Link href={`/admin/financeiro/pagar${tab ? `?status=${tab}` : ""}`} className="text-sm text-ice hover:text-frost">
            Limpar filtros
          </Link>
        }
      />
    );
  const copy: Record<string, { title: string; description: string }> = {
    "": {
      title: "Nada em aberto para pagar",
      description: "Lance boletos, notas de fornecedor e despesas fixas em Nova conta a pagar.",
    },
    vencido: { title: "Nenhuma conta vencida", description: "Todas as contas estão em dia." },
    pago: { title: "Nenhum pagamento registrado", description: "Os pagamentos registrados aparecem aqui." },
    cancelado: { title: "Nenhuma conta cancelada", description: "Contas canceladas saem da previsão e aparecem aqui." },
    todas: { title: "Nenhuma conta a pagar ainda", description: "Lance a primeira despesa em Nova conta a pagar." },
  };
  const c = copy[tab] ?? copy[""];
  return <EmptyState title={c.title} description={c.description} />;
}
