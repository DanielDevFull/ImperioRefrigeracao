import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Plus, Users } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager, SearchInput } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBRL, formatCustomerCode, formatDocument, formatPhone } from "@/lib/format";
import { PAGE_SIZE, pageFrom, param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { ClickableRow } from "./_components/clickable-row";
import { customerTabCounts, listCustomers, type CustomerFilter, type CustomerListRow } from "./_lib/queries";

export const metadata: Metadata = { title: "Clientes" };

const FILTERS: CustomerFilter[] = ["", "contrato", "sem-contrato", "inativos"];

export default async function ClientesPage({ searchParams }: PageProps<"/admin/clientes">) {
  const sp = await searchParams;
  const q = param(sp, "q");
  const raw = param(sp, "filtro") ?? "";
  const filter = (FILTERS.includes(raw as CustomerFilter) ? raw : "") as CustomerFilter;
  const page = pageFrom(sp);
  const aviso = param(sp, "aviso");

  const [{ rows, total }, counts] = await Promise.all([listCustomers({ q, filter, page }), customerTabCounts(q)]);

  return (
    <>
      <PageHeader
        title="Clientes"
        description={
          counts.all
            ? `${counts.all} ${counts.all === 1 ? "cliente cadastrado" : "clientes cadastrados"}, ${counts.contrato} com contrato ativo.`
            : "Cadastre os clientes para abrir OMs, contratos e cobranças."
        }
        actions={
          <Button asChild size="lg">
            <Link href="/admin/clientes/novo">
              <Plus />
              Novo cliente
            </Link>
          </Button>
        }
      />

      {aviso === "sem-portal" && (
        <p className="mb-4 rounded-lg border border-brass/30 bg-brass/10 px-4 py-2.5 text-sm text-brass">
          Seu usuário não está vinculado a um cliente, por isso o portal não abriu. Para ver o portal, crie um acesso na
          aba “Acesso ao portal” de um cliente.
        </p>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          param="filtro"
          options={[
            { value: "", label: "Todos", count: counts.all },
            { value: "contrato", label: "Com contrato ativo", count: counts.contrato },
            { value: "sem-contrato", label: "Sem contrato", count: counts.semContrato },
            { value: "inativos", label: "Inativos", count: counts.inativos },
          ]}
        />
        <SearchInput placeholder="Nome, documento, telefone ou e-mail" className="lg:w-80" />
      </div>

      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6 text-frost" />}
            title={q || filter ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
            description={
              q || filter
                ? "Tente outro termo de busca ou troque o filtro."
                : "Cadastre o primeiro cliente para começar a registrar equipamentos e OMs."
            }
            action={
              <Button asChild>
                <Link href="/admin/clientes/novo">
                  <Plus />
                  Novo cliente
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-rime hover:bg-transparent">
                    <TableHead className="pl-5 text-steel">Código</TableHead>
                    <TableHead className="text-steel">Cliente</TableHead>
                    <TableHead className="text-steel">Documento</TableHead>
                    <TableHead className="text-steel">Local principal</TableHead>
                    <TableHead className="text-right text-steel">Equip.</TableHead>
                    <TableHead className="text-steel">Contrato</TableHead>
                    <TableHead className="text-steel">Cobrança</TableHead>
                    <TableHead className="pr-5 text-center text-steel">Portal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <ClickableRow key={c.id} href={`/admin/clientes/${c.id}`} className={cn(c.status === "inativo" && "opacity-60")}>
                      <TableCell className="pl-5 text-xs text-steel tabular-nums">{formatCustomerCode(c.code)}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <Link
                          href={`/admin/clientes/${c.id}`}
                          className="block truncate font-medium text-silver hover:text-frost"
                        >
                          {c.tradeName || c.name}
                        </Link>
                        <span className="block truncate text-xs text-steel">
                          {c.tradeName ? c.name : c.phone ? formatPhone(c.phone) : "Pessoa física"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="mr-2 rounded bg-glacier px-1.5 py-0.5 text-[0.68rem] font-semibold text-frost/80">
                          {c.personType === "pj" ? "PJ" : "PF"}
                        </span>
                        <span className="text-sm tabular-nums text-silver/90">
                          {c.document ? formatDocument(c.document) : <span className="text-steel">—</span>}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.city ? (
                          <>
                            <span className="block text-silver/90">{c.district ?? c.city}</span>
                            {c.district && <span className="block text-xs text-steel">{c.city}</span>}
                          </>
                        ) : (
                          <span className="text-steel">Sem endereço</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-silver">{c.equipmentCount}</TableCell>
                      <TableCell>
                        <ContractCell row={c} />
                      </TableCell>
                      <TableCell>
                        <BillingCell row={c} />
                      </TableCell>
                      <TableCell className="pr-5 text-center">
                        <PortalCell has={c.hasPortal} />
                      </TableCell>
                    </ClickableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-rime md:hidden">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/clientes/${c.id}`}
                    className={cn("block px-4 py-3.5 active:bg-ice/5", c.status === "inativo" && "opacity-60")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-silver">{c.tradeName || c.name}</p>
                        <p className="truncate text-xs text-steel">
                          {formatCustomerCode(c.code)}
                          {c.city ? `, ${[c.district, c.city].filter(Boolean).join(", ")}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {c.hasPortal && <KeyRound className="size-3.5 text-ice" aria-label="Acesso ao portal" />}
                        <span className="text-xs tabular-nums text-steel">{c.equipmentCount} equip.</span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ContractCell row={c} />
                      {c.overdueCount > 0 && <BillingCell row={c} />}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={total} />
      </Panel>
    </>
  );
}

function ContractCell({ row }: { row: CustomerListRow }) {
  if (row.activeContracts === 0) return <span className="text-sm text-steel">Sem contrato</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <ToneBadge tone="mint">{row.activeContracts > 1 ? `${row.activeContracts} ativos` : "Ativo"}</ToneBadge>
      <span className="text-sm tabular-nums text-silver/90">
        {formatBRL(row.monthlyAmount)}
        <span className="text-xs text-steel">/mês</span>
      </span>
    </span>
  );
}

function BillingCell({ row }: { row: CustomerListRow }) {
  if (row.overdueCount === 0) return <span className="text-sm text-steel">Em dia</span>;
  return (
    <span className="inline-flex flex-col gap-0.5">
      <ToneBadge tone="red">
        {row.overdueCount === 1 ? "1 vencida" : `${row.overdueCount} vencidas`}
      </ToneBadge>
      <span className="pl-1 text-xs tabular-nums text-gauge-red/90">{formatBRL(row.overdueAmount)}</span>
    </span>
  );
}

function PortalCell({ has }: { has: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-grid size-7 place-items-center rounded-full",
            has ? "bg-ice/12 text-ice ring-1 ring-ice/25" : "text-steel/40",
          )}
          aria-label={has ? "Tem acesso ao portal" : "Sem acesso ao portal"}
        >
          <KeyRound className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{has ? "Tem acesso ao portal" : "Sem acesso ao portal"}</TooltipContent>
    </Tooltip>
  );
}
