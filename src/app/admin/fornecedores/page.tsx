import type { Metadata } from "next";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager, SearchInput } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { ToneBadge } from "@/components/system/tone-badge";
import { formatBRL, formatDocument, formatPhone, whatsappLink } from "@/lib/format";
import { PAGE_SIZE, pageFrom, param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { SupplierDialog } from "./_components/supplier-dialog";
import { listSuppliers, supplierCounts, type SupplierFilter } from "./_lib/queries";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function FornecedoresPage({ searchParams }: PageProps<"/admin/fornecedores">) {
  await requireStaff();
  const sp = await searchParams;
  const raw = param(sp, "situacao");
  const filter: SupplierFilter = raw === "inativos" || raw === "todos" ? raw : "ativos";
  const q = param(sp, "q");
  const page = pageFrom(sp);
  const [{ rows, total }, counts] = await Promise.all([listSuppliers({ q, filter, page }), supplierCounts()]);

  return (
    <>
      <PageHeader
        title="Fornecedores"
        description="Quem vende gás, peças e materiais para a Imperium, com os pedidos e as contas em aberto de cada um."
        actions={<SupplierDialog />}
      />

      <ReadoutBand
        className="mb-8"
        items={[
          { label: "Fornecedores ativos", value: counts.active, hint: counts.inactive ? `${counts.inactive} inativos` : undefined },
          { label: "Comprado em 12 meses", value: counts.bought12m, format: "brl", hint: "pedidos recebidos" },
          {
            label: "A pagar a fornecedores",
            value: counts.openPayables,
            format: "brl",
            tone: counts.openPayables > 0 ? "brass" : undefined,
            hint: "contas em aberto",
            href: "/admin/financeiro/pagar",
          },
        ]}
      />

      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-rime p-4 lg:flex-row lg:items-center">
          <SearchInput placeholder="Buscar por nome, CNPJ, contato ou e-mail" className="lg:w-80" />
          <FilterTabs
            param="situacao"
            className="lg:ml-auto"
            options={[
              { value: "", label: "Ativos", count: counts.active },
              { value: "inativos", label: "Inativos", count: counts.inactive },
              { value: "todos", label: "Todos", count: counts.active + counts.inactive },
            ]}
          />
        </div>

        {rows.length === 0 ? (
          q || filter !== "ativos" ? (
            <EmptyState title="Nenhum fornecedor encontrado" description="Tente outra busca ou mude o filtro de situação." />
          ) : (
            <EmptyState
              title="Nenhum fornecedor cadastrado"
              description="Cadastre as distribuidoras de onde vêm o gás e as peças para fazer pedidos de compra."
              action={<SupplierDialog />}
            />
          )
        ) : (
          <>
            <ul className="divide-y divide-rime md:hidden">
              {rows.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/fornecedores/${s.id}`} className={cn("flex items-start gap-3 px-4 py-3 active:bg-ice/5", !s.active && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-silver">{s.name}</p>
                      <p className="truncate text-xs text-steel">{s.contactName ?? (s.phone ? formatPhone(s.phone) : "Sem contato")}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("text-sm tabular-nums", s.openPayables > 0 ? "text-brass" : "text-steel")}>
                        {s.openPayables > 0 ? formatBRL(s.openPayables) : "Nada a pagar"}
                      </p>
                      <p className="text-xs text-steel tabular-nums">
                        {s.products} {s.products === 1 ? "produto" : "produtos"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Fornecedor</TableHead>
                    <TableHead className="hidden lg:table-cell">CNPJ</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead className="hidden xl:table-cell">E-mail</TableHead>
                    <TableHead className="text-right">Produtos</TableHead>
                    <TableHead className="text-right">Pedidos abertos</TableHead>
                    <TableHead className="text-right">A pagar</TableHead>
                    <TableHead className="pr-5">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => {
                    const wa = whatsappLink(s.phone);
                    return (
                      <TableRow key={s.id} className={cn("relative", !s.active && "opacity-60")}>
                        <TableCell className="max-w-64 pl-5">
                          <Link
                            href={`/admin/fornecedores/${s.id}`}
                            className="block truncate font-medium text-silver after:absolute after:inset-0 hover:text-frost"
                          >
                            {s.name}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden tabular-nums text-steel lg:table-cell">
                          {s.document ? formatDocument(s.document) : "—"}
                        </TableCell>
                        <TableCell>
                          <span className="block text-silver">{s.contactName ?? "—"}</span>
                          {s.phone &&
                            (wa ? (
                              <a href={wa} target="_blank" rel="noreferrer" className="relative z-10 text-xs tabular-nums text-steel hover:text-frost">
                                {formatPhone(s.phone)}
                              </a>
                            ) : (
                              <span className="text-xs text-steel">{formatPhone(s.phone)}</span>
                            ))}
                        </TableCell>
                        <TableCell className="hidden max-w-56 truncate text-steel xl:table-cell">
                          {s.email ? (
                            <a href={`mailto:${s.email}`} className="relative z-10 hover:text-frost">
                              {s.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-steel">{s.products}</TableCell>
                        <TableCell className="text-right tabular-nums text-steel">{s.ordersInProgress}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", s.openPayables > 0 ? "text-brass" : "text-steel")}>
                          {s.openPayables > 0 ? formatBRL(s.openPayables) : "—"}
                        </TableCell>
                        <TableCell className="pr-5">
                          <ToneBadge tone={s.active ? "mint" : "steel"}>{s.active ? "Ativo" : "Inativo"}</ToneBadge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} total={total} />
          </>
        )}
      </Panel>
    </>
  );
}
