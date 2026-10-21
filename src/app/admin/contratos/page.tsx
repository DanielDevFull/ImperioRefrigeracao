import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager, SearchInput } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { ContractStatusBadge, ReceivableStatusBadge } from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatContractCode, formatDate } from "@/lib/format";
import { effectiveFinanceStatus } from "@/lib/labels";
import { pageFrom, PAGE_SIZE, param } from "@/lib/params";
import { CONTRACT_STATUSES, contractsOverview, listContracts, type ContractStatus } from "./_lib/queries";

export const metadata: Metadata = { title: "Contratos" };

type Row = Awaited<ReturnType<typeof listContracts>>["rows"][number];

function NextInvoice({ row, today }: { row: Row; today: string }) {
  if (!row.nextDueDate || !row.nextStatus) {
    return <span className="text-sm text-steel">{row.lastPaidDate ? "Em dia" : "Nenhuma gerada"}</span>;
  }
  const status = effectiveFinanceStatus(row.nextStatus, row.nextDueDate, today);
  return (
    <span className="flex flex-col items-start gap-1">
      <span className={status === "vencido" ? "tabular-nums text-gauge-red" : "tabular-nums text-silver"}>{formatDate(row.nextDueDate)}</span>
      {row.overdue > 1 ? (
        <ToneBadge tone="red">{row.overdue} vencidas</ToneBadge>
      ) : (
        status !== "aberto" && <ReceivableStatusBadge status={status} />
      )}
    </span>
  );
}

function PlanCell({ row }: { row: Row }) {
  const plans = row.plans ?? [];
  return (
    <>
      <span className="block truncate text-silver">{row.name}</span>
      {plans.length > 0 && (
        <span className="block truncate text-xs text-steel">
          {plans[0]}
          {plans.length > 1 && ` e mais ${plans.length - 1}`}
        </span>
      )}
    </>
  );
}

export default async function ContratosPage({ searchParams }: PageProps<"/admin/contratos">) {
  const sp = await searchParams;
  const rawStatus = param(sp, "status");
  const status = CONTRACT_STATUSES.includes(rawStatus as ContractStatus) ? (rawStatus as ContractStatus) : undefined;
  const q = param(sp, "q");
  const page = pageFrom(sp);
  const [overview, { rows, total, today }] = await Promise.all([contractsOverview(), listContracts({ status, q, page })]);
  const sc = overview.statusCounts;
  const all = Object.values(sc).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Contratos"
        description="Planos dos clientes: cada contrato gera as mensalidades no dia de vencimento e as OMs preventivas dos equipamentos cobertos."
        actions={
          <Button asChild className="h-9 px-3.5">
            <Link href="/admin/contratos/novo">
              <Plus />
              Novo contrato
            </Link>
          </Button>
        }
      />

      <ReadoutBand
        className="mb-6"
        items={[
          { label: "Contratos ativos", value: overview.active, format: "integer", href: "/admin/contratos?status=ativo" },
          { label: "Receita recorrente mensal", value: overview.mrr, format: "brl", tone: "ice" },
          { label: "Ticket médio", value: overview.ticket, format: "brl" },
          { label: "Equipamentos cobertos", value: overview.equipment, format: "integer", hint: "em contratos ativos" },
        ]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          options={[
            { value: "", label: "Todos", count: all },
            { value: "ativo", label: "Ativos", count: sc.ativo ?? 0 },
            { value: "suspenso", label: "Suspensos", count: sc.suspenso ?? 0 },
            { value: "cancelado", label: "Cancelados", count: sc.cancelado ?? 0 },
            { value: "encerrado", label: "Encerrados", count: sc.encerrado ?? 0 },
          ]}
        />
        <SearchInput placeholder="Buscar cliente ou contrato…" />
      </div>

      <Panel flush>
        {rows.length === 0 ? (
          q || status ? (
            <EmptyState
              title="Nenhum contrato encontrado"
              description={q ? `Nada corresponde a "${q}". Confira o nome do cliente ou limpe os filtros.` : "Não há contratos nesta situação."}
              action={
                <Button asChild variant="outline">
                  <Link href="/admin/contratos">Ver todos os contratos</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Nenhum contrato ainda"
              description="Ao criar um contrato, a mensalidade e as OMs preventivas dos equipamentos passam a sair sozinhas todos os meses."
              action={
                <Button asChild>
                  <Link href="/admin/contratos/novo">
                    <Plus />
                    Criar primeiro contrato
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <>
            {/* Celular: linhas empilhadas */}
            <ul className="divide-y divide-rime lg:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/contratos/${r.id}`} className="block px-4 py-3.5 transition-colors hover:bg-ice/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-silver">{r.customerName}</p>
                        <p className="truncate text-sm text-steel">
                          {formatContractCode(r.code)}, {r.name}
                        </p>
                      </div>
                      <ContractStatusBadge status={r.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="tabular-nums text-silver">{formatBRL(r.monthlyAmount)}/mês</span>
                      <span className="text-steel">dia {r.billingDay}</span>
                      <span className="text-steel">{r.equipmentCount} equip.</span>
                      {r.overdue > 0 && <ToneBadge tone="red">{r.overdue === 1 ? "1 vencida" : `${r.overdue} vencidas`}</ToneBadge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <Table className="hidden lg:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Contrato</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Equip.</TableHead>
                  <TableHead className="text-right">Mensalidade</TableHead>
                  <TableHead className="pl-4">Situação</TableHead>
                  <TableHead className="pr-5">Próxima mensalidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="relative">
                    <TableCell className="py-3 pl-5">
                      <Link
                        href={`/admin/contratos/${r.id}`}
                        className="font-medium tabular-nums text-silver after:absolute after:inset-0 after:content-[''] hover:text-frost"
                      >
                        {formatContractCode(r.code)}
                      </Link>
                      <span className="block text-xs tabular-nums text-steel">desde {formatDate(r.startDate)}</span>
                    </TableCell>
                    <TableCell className="max-w-[15rem]">
                      <span className="block truncate text-silver">{r.customerName}</span>
                    </TableCell>
                    <TableCell className="max-w-[15rem]">
                      <PlanCell row={r} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.equipmentCount}</TableCell>
                    <TableCell className="text-right">
                      <span className="block tabular-nums text-silver">{formatBRL(r.monthlyAmount)}</span>
                      <span className="block text-xs tabular-nums text-steel">todo dia {r.billingDay}</span>
                    </TableCell>
                    <TableCell className="pl-4">
                      <ContractStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="pr-5">
                      <NextInvoice row={r} today={today} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} pageSize={PAGE_SIZE} total={total} />
          </>
        )}
      </Panel>
    </>
  );
}
