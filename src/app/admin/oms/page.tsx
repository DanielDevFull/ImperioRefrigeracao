import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, Plus } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE, pageFrom, param } from "@/lib/params";
import { ListFilters } from "./_components/list-filters";
import { OmsTable } from "./_components/oms-table";
import { STATUS_GROUPS } from "./_lib/constants";
import { activeTechnicians, countOverdue, listWorkOrders } from "./_lib/queries";

export const metadata: Metadata = { title: "Ordens de manutenção" };

export default async function OmsPage({ searchParams }: PageProps<"/admin/oms">) {
  const sp = await searchParams;
  const filters = {
    q: param(sp, "q"),
    status: param(sp, "status"),
    tipo: param(sp, "tipo"),
    tecnico: param(sp, "tecnico"),
    de: param(sp, "de"),
    ate: param(sp, "ate"),
    origem: param(sp, "origem"),
    filtro: param(sp, "filtro"),
    page: pageFrom(sp),
  };
  const [{ rows, counts, total, today }, technicians, overdue] = await Promise.all([
    listWorkOrders(filters),
    activeTechnicians(),
    countOverdue(),
  ]);
  const hasFilters = Boolean(
    filters.q || filters.tipo || filters.tecnico || filters.de || filters.ate || filters.origem || filters.filtro,
  );

  return (
    <>
      <PageHeader
        title="Ordens de manutenção"
        description="Todas as OMs da empresa: preventivas geradas pelos planos, chamados do portal e serviços avulsos."
        actions={
          <>
            <Button variant="outline" asChild className="h-9">
              <Link href="/admin/agenda">
                <CalendarRange className="size-4" />
                Quadro de despacho
              </Link>
            </Button>
            <Button asChild className="h-9">
              <Link href="/admin/oms/nova">
                <Plus className="size-4" />
                Nova OM
              </Link>
            </Button>
          </>
        }
      />

      <FilterTabs
        options={STATUS_GROUPS.map((g) => ({ value: g.value, label: g.label, count: counts[g.value] ?? 0 }))}
        className="mb-4 w-fit max-w-full flex-nowrap overflow-x-auto xl:flex-wrap [&>button]:shrink-0 [&>button]:whitespace-nowrap"
      />

      <div className="mb-4">
        <ListFilters technicians={technicians} overdue={overdue} />
      </div>

      <Panel flush>
        {rows.length === 0 ? (
          hasFilters || filters.status ? (
            <EmptyState
              title="Nenhuma OM com esses filtros"
              description="Tente outro termo de busca, outro período ou limpe os filtros para ver todas as OMs."
              action={
                <Button variant="outline" asChild>
                  <Link href="/admin/oms">Limpar filtros</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Nenhuma OM cadastrada ainda"
              description="As OMs preventivas aparecem aqui quando a rotina diária roda. Para um chamado avulso, crie a OM manualmente."
              action={
                <Button asChild>
                  <Link href="/admin/oms/nova">
                    <Plus className="size-4" />
                    Nova OM
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <>
            <OmsTable rows={rows} technicians={technicians} today={today} />
            <Pager page={filters.page} pageSize={PAGE_SIZE} total={total} />
          </>
        )}
      </Panel>
    </>
  );
}
