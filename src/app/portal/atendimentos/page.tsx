import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { ChevronRight, Plus } from "lucide-react";
import { db } from "@/db";
import { workOrders } from "@/db/schema";
import { EmptyState } from "@/components/system/empty-state";
import { Pager } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";
import { requireCustomer } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { formatOM } from "@/lib/format";
import { pageFrom, PAGE_SIZE, param } from "@/lib/params";
import { CustomerStatusBadge, DateChip, EquipmentIcon } from "../_components/bits";
import { PortalTabs } from "../_components/portal-tabs";
import { RatingDisplay } from "../_components/rating";
import { describeStatus, firstName, workOrderTypeForCustomer } from "../_lib/copy";

export const metadata: Metadata = { title: "Atendimentos" };

type WoStatus = (typeof workOrders.$inferSelect)["status"];

const GROUPS: Record<string, { label: string; statuses: WoStatus[] }> = {
  andamento: { label: "Em andamento", statuses: ["aberta", "em_deslocamento", "em_execucao", "pausada", "aguardando_material"] },
  agendados: { label: "Agendados", statuses: ["agendada"] },
  concluidos: { label: "Concluídos", statuses: ["concluida"] },
  cancelados: { label: "Cancelados", statuses: ["cancelada"] },
};

export default async function AtendimentosPage({ searchParams }: PageProps<"/portal/atendimentos">) {
  const { customer } = await requireCustomer();
  const sp = await searchParams;
  const page = pageFrom(sp);

  const countRows = await db
    .select({ status: workOrders.status, n: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(eq(workOrders.customerId, customer.id))
    .groupBy(workOrders.status);
  const countOf = (key: string) =>
    countRows.filter((r) => GROUPS[key].statuses.includes(r.status)).reduce((s, r) => s + r.n, 0);
  const counts = Object.fromEntries(Object.keys(GROUPS).map((k) => [k, countOf(k)])) as Record<string, number>;

  const asked = param(sp, "aba");
  const active =
    asked && GROUPS[asked] ? asked : (["andamento", "agendados", "concluidos"].find((k) => counts[k] > 0) ?? "andamento");
  const group = GROUPS[active];

  const order =
    active === "concluidos"
      ? [desc(workOrders.finishedAt)]
      : active === "cancelados"
        ? [desc(workOrders.updatedAt)]
        : [asc(sql`coalesce(${workOrders.scheduledDate}, ${workOrders.dueDate}, ${workOrders.createdAt}::date)`)];

  const rows = await db.query.workOrders.findMany({
    where: and(eq(workOrders.customerId, customer.id), inArray(workOrders.status, group.statuses)),
    with: {
      technician: { columns: { name: true } },
      equipment: { columns: { brand: true, model: true, location: true }, with: { type: { columns: { name: true, icon: true } } } },
    },
    orderBy: order,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const today = todayISO();
  const tabs = Object.entries(GROUPS)
    .filter(([k]) => k !== "cancelados" || counts.cancelados > 0)
    .map(([k, g]) => ({ value: k, label: g.label, href: `/portal/atendimentos?aba=${k}`, count: counts[k] }));

  return (
    <div>
      <PageHeader
        title="Atendimentos"
        description="Visitas do seu plano e chamados que você abriu, do pedido ao relatório."
        actions={
          <Button asChild size="lg" className="h-10 px-4">
            <Link href="/portal/atendimentos/novo">
              <Plus /> Solicitar atendimento
            </Link>
          </Button>
        }
      />

      {total === 0 ? (
        <Panel>
          <EmptyState
            title="Nenhum atendimento ainda"
            description="Quando a Imperium visitar seus equipamentos, o histórico aparece aqui. Precisa de ajuda agora?"
            action={
              <Button asChild size="lg">
                <Link href="/portal/atendimentos/novo">Solicitar atendimento</Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <PortalTabs id="atendimentos" tabs={tabs} active={active} className="mb-4" />
          <Panel flush>
            {rows.length === 0 ? (
              <EmptyState
                title={active === "andamento" ? "Nada em andamento agora" : active === "agendados" ? "Nenhuma visita agendada" : "Nada por aqui"}
                description={
                  active === "andamento"
                    ? counts.agendados > 0
                      ? "Suas próximas visitas já estão marcadas. Veja em Agendados."
                      : "Se algum equipamento apresentar problema, abra um chamado."
                    : "As próximas visitas do plano aparecem aqui assim que forem agendadas."
                }
                action={
                  active === "andamento" && counts.agendados > 0 ? (
                    <Button asChild variant="outline">
                      <Link href="/portal/atendimentos?aba=agendados">Ver agendados</Link>
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link href="/portal/atendimentos/novo">Solicitar atendimento</Link>
                    </Button>
                  )
                }
              />
            ) : (
              <ul className="divide-y divide-rime">
                {rows.map((w) => {
                  const tech = firstName(w.technician?.name);
                  const s = describeStatus(w, tech);
                  const date =
                    w.status === "concluida" && w.finishedAt
                      ? todayISO(w.finishedAt)
                      : (w.scheduledDate ?? w.dueDate ?? todayISO(w.createdAt));
                  const eqName = w.equipment
                    ? [w.equipment.brand, w.equipment.model].filter(Boolean).join(" ") || w.equipment.type?.name
                    : null;
                  const overdue = w.status === "agendada" && date < today;
                  return (
                    <li key={w.id}>
                      <Link
                        href={`/portal/atendimentos/${w.id}`}
                        className="flex items-start gap-3.5 px-4 py-4 transition-colors hover:bg-ice/5 sm:items-center sm:gap-4 sm:px-5"
                      >
                        <DateChip date={date} tone={s.tone === "steel" ? "steel" : s.live ? "ice" : s.tone} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5">
                            <p className="line-clamp-2 text-sm font-medium text-silver sm:truncate">{w.title}</p>
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel">
                            <span>{workOrderTypeForCustomer[w.type] ?? w.type}</span>
                            <span className="readout text-steel/80">{formatOM(w.number)}</span>
                            {eqName && (
                              <span className="inline-flex items-center gap-1">
                                <EquipmentIcon icon={w.equipment?.type?.icon} className="size-3.5" />
                                {eqName}
                                {w.equipment?.location ? `, ${w.equipment.location}` : ""}
                              </span>
                            )}
                          </p>
                          <p className="mt-1.5 text-xs text-steel/90">
                            {overdue ? "A data prevista passou; a equipe vai confirmar uma nova data com você." : s.detail}
                          </p>
                          <div className="mt-2 flex items-center gap-3 sm:hidden">
                            <CustomerStatusBadge status={w.status} />
                            {w.rating != null && <RatingDisplay value={w.rating} />}
                          </div>
                        </div>
                        <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
                          <CustomerStatusBadge status={w.status} />
                          {w.rating != null ? (
                            <RatingDisplay value={w.rating} />
                          ) : w.status === "concluida" ? (
                            <span className="text-xs text-ice">Avalie o atendimento</span>
                          ) : (
                            tech && <span className="text-xs text-steel">Técnico {tech}</span>
                          )}
                        </div>
                        <ChevronRight className="mt-3 size-4 shrink-0 text-steel/60 sm:mt-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <Pager page={page} pageSize={PAGE_SIZE} total={counts[active]} />
          </Panel>
        </>
      )}
    </div>
  );
}
