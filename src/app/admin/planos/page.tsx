import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, SearchInput } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import { frequencyMonths as frequencyLabels } from "@/lib/labels";
import { param } from "@/lib/params";
import { listPlans, type PlanFilter } from "./_lib/queries";
import { plural } from "./_lib/preview";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Planos de manutenção" };

function intervalText(n: number, taskCount: number) {
  if (!taskCount) return "Sem tarefas";
  return frequencyLabels[n] ?? `A cada ${n} meses`;
}

export default async function PlanosPage({ searchParams }: PageProps<"/admin/planos">) {
  await requireStaff();
  const sp = await searchParams;
  const raw = param(sp, "status");
  const filter: PlanFilter = raw === "inativos" || raw === "todos" ? raw : "ativos";
  const q = param(sp, "q");
  const { rows, counts } = await listPlans({ filter, q });

  return (
    <>
      <PageHeader
        title="Planos de manutenção"
        description="O que é feito em cada visita e com que frequência. Os contratos usam estes planos para gerar as OMs preventivas automaticamente."
        actions={
          <Button asChild className="h-9 px-3.5">
            <Link href="/admin/planos/novo">
              <Plus />
              Novo plano
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          options={[
            { value: "", label: "Ativos", count: counts.ativos },
            { value: "inativos", label: "Inativos", count: counts.inativos },
            { value: "todos", label: "Todos", count: counts.todos },
          ]}
        />
        <SearchInput placeholder="Buscar plano…" />
      </div>

      <Panel flush>
        {rows.length === 0 ? (
          q || filter !== "ativos" ? (
            <EmptyState
              title="Nenhum plano encontrado"
              description={q ? `Nada corresponde a "${q}". Tente outro termo ou veja todos os planos.` : "Não há planos nesta situação."}
              action={
                <Button asChild variant="outline">
                  <Link href="/admin/planos?status=todos">Ver todos os planos</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Nenhum plano de manutenção ainda"
              description="Monte o checklist das visitas (limpeza, medições, higienização) e a frequência de cada tarefa. Depois é só usar o plano nos contratos."
              action={
                <Button asChild>
                  <Link href="/admin/planos/novo">
                    <Plus />
                    Criar primeiro plano
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <>
            {/* Celular: linhas empilhadas */}
            <ul className="divide-y divide-rime md:hidden">
              {rows.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/planos/${p.id}`} className="block px-4 py-3.5 transition-colors hover:bg-ice/5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-medium text-silver">{p.name}</p>
                      {!p.active ? <ToneBadge tone="steel">Inativo</ToneBadge> : p.isPmoc ? <ToneBadge tone="mint">PMOC</ToneBadge> : null}
                    </div>
                    <p className="mt-1 text-sm text-steel">
                      {intervalText(p.interval, p.taskCount)}, {plural(p.taskCount, "tarefa", "tarefas")}
                      {p.equipmentType ? `, ${p.equipmentType}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-steel">
                      <span className="tabular-nums text-silver">{formatBRL(p.visitReferenceValue)}</span> por visita,{" "}
                      {plural(p.equipmentUsing, "equipamento", "equipamentos")} em contrato
                    </p>
                  </Link>
                </li>
              ))}
            </ul>

            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Plano</TableHead>
                  <TableHead>Tipo de equipamento</TableHead>
                  <TableHead>Visita</TableHead>
                  <TableHead className="text-right">Tarefas</TableHead>
                  <TableHead className="text-right">Materiais</TableHead>
                  <TableHead className="text-right">Valor de referência</TableHead>
                  <TableHead className="text-right">Equipamentos</TableHead>
                  <TableHead className="pr-5">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id} className="relative">
                    <TableCell className="max-w-[22rem] py-3 pl-5">
                      <Link
                        href={`/admin/planos/${p.id}`}
                        className="font-medium text-silver after:absolute after:inset-0 after:content-[''] hover:text-frost"
                      >
                        {p.name}
                      </Link>
                      {p.description && <p className="mt-0.5 truncate text-xs text-steel">{p.description}</p>}
                    </TableCell>
                    <TableCell className="text-steel">
                      <span className="inline-flex items-center gap-2">
                        {p.equipmentType ?? "Qualquer tipo"}
                        {p.isPmoc && <ToneBadge tone="mint">PMOC</ToneBadge>}
                      </span>
                    </TableCell>
                    <TableCell className={p.taskCount ? "text-silver" : "text-brass"}>{intervalText(p.interval, p.taskCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.taskCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-steel">{p.materialCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(p.visitReferenceValue)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.equipmentUsing}
                      {p.contractsUsing > 0 && (
                        <span className="ml-1 text-xs text-steel">em {plural(p.contractsUsing, "contrato", "contratos")}</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-5">
                      {p.active ? <ToneBadge tone="mint">Ativo</ToneBadge> : <ToneBadge tone="steel">Inativo</ToneBadge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Panel>
    </>
  );
}
