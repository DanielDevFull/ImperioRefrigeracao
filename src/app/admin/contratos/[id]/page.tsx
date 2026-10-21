import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { PageHeader } from "@/components/system/page-header";
import { DetailList, Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { ContractStatusBadge, ReceivableStatusBadge, WorkOrderStatusBadge } from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { todayISO } from "@/lib/dates";
import {
  formatBRL,
  formatCompetence,
  formatContractCode,
  formatCustomerCode,
  formatDate,
  formatEquipmentCode,
  formatOM,
} from "@/lib/format";
import { effectiveFinanceStatus } from "@/lib/labels";
import { getSettings } from "@/server/settings";
import { MonthStrip } from "../../planos/_components/month-strip";
import { monthAbbr, plural } from "../../planos/_lib/preview";
import { ContractStatusActions, EditContractButton, GenerateNowButton } from "../_components/contract-actions";
import { AddItemButton, EditItemButton, RemoveItemButton } from "../_components/item-dialogs";
import { monthlyForecast, nextVisit } from "../_lib/forecast";
import {
  activePlansWithTasks,
  activeTechnicians,
  contractReceivables,
  contractWorkOrders,
  customerEquipmentWithCoverage,
  futureOpenWorkOrderIds,
  getContract,
} from "../_lib/queries";

const GENERATES = new Set(["ativo", "em_manutencao"]);

export async function generateMetadata({ params }: PageProps<"/admin/contratos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const c = await getContract(id);
  return { title: c ? `${formatContractCode(c.code)} ${c.customer.name}` : "Contrato" };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function ContratoPage({ params }: PageProps<"/admin/contratos/[id]">) {
  const { id } = await params;
  const c = await getContract(id);
  if (!c) notFound();
  const today = todayISO();
  const [wos, recs, settings, cancelIds, customerEquipment, plans, technicians] = await Promise.all([
    contractWorkOrders(c.id),
    contractReceivables(c.id),
    getSettings(),
    futureOpenWorkOrderIds({ contractId: c.id }),
    customerEquipmentWithCoverage(c.customerId),
    activePlansWithTasks(),
    activeTechnicians(),
  ]);

  const activeItems = c.items.filter((i) => i.active);
  const removedItems = c.items.filter((i) => !i.active);
  const isActive = c.status === "ativo";
  const closed = c.status === "cancelado" || c.status === "encerrado";
  const term = { startDate: c.startDate, endDate: c.endDate };

  const scheduleItems = activeItems
    .filter((i) => i.plan.active && GENERATES.has(i.equipment.status))
    .map((i) => ({ anchorDate: i.anchorDate, tasks: i.plan.tasks, id: i.id }));
  const forecast = monthlyForecast(scheduleItems, term, today, 12);
  const visitsYear = forecast.reduce((n, m) => n + m.dates.length, 0);

  const openRecs = recs.filter((r) => r.status === "aberto" || r.status === "em_analise");
  const openAmount = openRecs.reduce((n, r) => n + r.amount - r.discount, 0);
  const overdue = recs.filter((r) => effectiveFinanceStatus(r.status, r.dueDate, today) === "vencido");

  const futureByItem = new Map<string, number>();
  const openByItem = new Map<string, number>();
  for (const w of wos) {
    if (!w.contractEquipmentId) continue;
    if (w.status === "aberta" || w.status === "agendada") {
      openByItem.set(w.contractEquipmentId, (openByItem.get(w.contractEquipmentId) ?? 0) + 1);
      if ((w.scheduledDate ?? w.dueDate ?? "") >= today)
        futureByItem.set(w.contractEquipmentId, (futureByItem.get(w.contractEquipmentId) ?? 0) + 1);
    }
  }

  const freeEquipment = customerEquipment
    .filter((e) => !e.coveredBy && e.status !== "removido")
    .map((e) => ({
      id: e.id,
      code: e.code,
      typeId: e.typeId,
      status: e.status,
      label: [e.typeName, [e.brand, e.model].filter(Boolean).join(" "), e.location].filter(Boolean).join(", "),
    }));

  const contractInfo = {
    id: c.id,
    name: c.name,
    status: c.status,
    monthlyAmount: c.monthlyAmount,
    billingDay: c.billingDay,
    startDate: c.startDate,
    endDate: c.endDate,
    notes: c.notes,
  };

  const items = activeItems.map((i) => {
    const label = [i.equipment.type?.name, i.equipment.location].filter(Boolean).join(", ") || formatEquipmentCode(i.equipment.code);
    const generates = i.plan.active && i.plan.tasks.length > 0 && GENERATES.has(i.equipment.status);
    const next = generates && isActive ? nextVisit({ anchorDate: i.anchorDate, tasks: i.plan.tasks }, term, today) : null;
    const problem = !i.plan.active
      ? "Plano inativo"
      : !i.plan.tasks.length
        ? "Plano sem tarefas"
        : !GENERATES.has(i.equipment.status)
          ? "Equipamento inativo"
          : !i.equipment.siteId
            ? "Sem endereço"
            : null;
    return { ...i, label, next, problem };
  });

  return (
    <>
      <PageHeader
        back={{ href: "/admin/contratos", label: "Contratos" }}
        title={c.name}
        meta={
          <>
            <span className="text-sm tabular-nums text-steel">{formatContractCode(c.code)}</span>
            <ContractStatusBadge status={c.status} />
            <Link href={`/admin/clientes/${c.customer.id}`} className="inline-flex items-center gap-1 text-sm text-ice hover:underline">
              {c.customer.name}
              <ArrowUpRight className="size-3.5" />
            </Link>
          </>
        }
        actions={
          <>
            {!closed && <GenerateNowButton contractId={c.id} disabled={!isActive || activeItems.length === 0} />}
            {!closed && <EditContractButton contract={contractInfo} />}
            <ContractStatusActions contract={contractInfo} cancelCount={cancelIds.length} activeItems={activeItems.length} />
          </>
        }
      />

      {c.status === "suspenso" && (
        <div role="status" className="mb-6 rounded-xl border border-brass/30 bg-brass/10 px-4 py-3 text-sm text-brass">
          Contrato suspenso: a rotina diária não gera mensalidades nem OMs para ele. Reative para retomar.
        </div>
      )}
      {closed && (
        <div role="status" className="mb-6 rounded-xl border border-rime-strong bg-steel/10 px-4 py-3 text-sm text-steel">
          Contrato {c.status === "cancelado" ? "cancelado" : "encerrado"}. Os equipamentos foram liberados e nada novo é gerado. O
          histórico de OMs e mensalidades continua abaixo.
        </div>
      )}

      <ReadoutBand
        className="mb-6"
        items={[
          { label: "Mensalidade", value: c.monthlyAmount, format: "brl", hint: `vence todo dia ${c.billingDay}` },
          { label: "Equipamentos cobertos", value: activeItems.length, format: "integer" },
          { label: "Visitas nos próximos 12 meses", value: isActive ? visitsYear : 0, format: "integer", hint: isActive ? undefined : "contrato parado" },
          {
            label: "Em aberto",
            value: openAmount,
            format: "brl",
            tone: overdue.length ? "red" : undefined,
            hint: overdue.length ? `${plural(overdue.length, "mensalidade vencida", "mensalidades vencidas")}` : openRecs.length ? "em dia" : "nada a receber",
          },
        ]}
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Panel title="Dados do contrato">
          <DetailList
            items={[
              {
                label: "Cliente",
                value: (
                  <Link href={`/admin/clientes/${c.customer.id}`} className="text-ice hover:underline">
                    {c.customer.name}
                  </Link>
                ),
              },
              { label: "Mensalidade", value: <span className="tabular-nums">{formatBRL(c.monthlyAmount)}</span> },
              { label: "Início", value: formatDate(c.startDate) },
              { label: "Término", value: c.endDate ? formatDate(c.endDate) : "Sem término" },
              { label: "Vencimento", value: `Todo dia ${c.billingDay}` },
              { label: "Código", value: `${formatContractCode(c.code)}, cliente ${formatCustomerCode(c.customer.code)}` },
            ]}
          />
          {c.notes && (
            <div className="mt-4 border-t border-rime pt-4">
              <p className="text-xs text-steel">Observações</p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-silver">{c.notes}</p>
            </div>
          )}
        </Panel>

        <Panel
          title="Previsão de visitas"
          description={
            isActive
              ? `${plural(visitsYear, "visita preventiva prevista", "visitas preventivas previstas")} nos próximos 12 meses. A rotina gera as OMs com ${settings.workOrderHorizonDays} dias de antecedência.`
              : "Contrato parado: nenhuma visita nova será gerada."
          }
        >
          <MonthStrip
            cells={forecast.map((m) => ({
              month: m.month,
              value: isActive ? m.dates.length : 0,
              title: `${capitalize(formatCompetence(m.month.slice(0, 7)))}: ${plural(isActive ? m.dates.length : 0, "visita", "visitas")}`,
            }))}
          />
        </Panel>
      </div>

      <Panel
        className="mb-6"
        title="Equipamentos cobertos"
        description="Cada equipamento segue o seu plano a partir da âncora (primeira visita)."
        actions={
          !closed ? (
            <AddItemButton
              contractId={c.id}
              equipment={freeEquipment}
              plans={plans}
              technicians={technicians}
              defaultTechnicianId={c.customer.defaultTechnicianId}
              today={today}
            />
          ) : undefined
        }
        flush
      >
        {items.length === 0 ? (
          <EmptyState
            title={closed ? "Nenhum equipamento no contrato" : "Nenhum equipamento coberto"}
            description={
              closed
                ? "Os equipamentos foram liberados quando o contrato foi encerrado."
                : "Sem equipamentos o contrato só gera a mensalidade. Inclua os aparelhos do cliente para as OMs saírem sozinhas."
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-rime lg:hidden">
              {items.map((i) => (
                <li key={i.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/equipamentos/${i.equipment.id}`} className="min-w-0">
                      <span className="block truncate font-medium text-silver">{i.label}</span>
                      <span className="block text-xs tabular-nums text-steel">{formatEquipmentCode(i.equipment.code)}</span>
                    </Link>
                    {!closed && (
                      <div className="flex shrink-0 items-center">
                        <EditItemButton
                          item={{
                            id: i.id,
                            label: i.label,
                            maintenancePlanId: i.maintenancePlanId,
                            anchorDate: i.anchorDate,
                            preferredTechnicianId: i.preferredTechnicianId,
                            openWorkOrders: openByItem.get(i.id) ?? 0,
                          }}
                          plans={plans}
                          technicians={technicians}
                        />
                        <RemoveItemButton itemId={i.id} label={i.label} futureCount={futureByItem.get(i.id) ?? 0} />
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-steel">
                    <Link href={`/admin/planos/${i.plan.id}`} className="text-silver hover:text-frost">
                      {i.plan.name}
                    </Link>
                    {i.preferredTechnician ? `, ${i.preferredTechnician.name}` : ", sem técnico"}
                  </p>
                  <p className="mt-1 text-xs text-steel">
                    Próxima visita: <span className="tabular-nums text-silver">{i.next ? formatDate(i.next) : "—"}</span>
                    {i.problem && <ToneBadge tone="brass" className="ml-2">{i.problem}</ToneBadge>}
                  </p>
                </li>
              ))}
            </ul>

            <Table className="hidden lg:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Equipamento</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Âncora</TableHead>
                  <TableHead>Técnico preferencial</TableHead>
                  <TableHead>Próxima visita</TableHead>
                  <TableHead>Última gerada</TableHead>
                  <TableHead className="pr-5 text-right">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="max-w-[18rem] py-3 pl-5">
                      <Link href={`/admin/equipamentos/${i.equipment.id}`} className="block truncate font-medium text-silver hover:text-frost">
                        {i.label}
                      </Link>
                      <span className="block truncate text-xs text-steel">
                        <span className="tabular-nums">{formatEquipmentCode(i.equipment.code)}</span>
                        {[i.equipment.brand, i.equipment.model].filter(Boolean).length > 0 &&
                          `, ${[i.equipment.brand, i.equipment.model].filter(Boolean).join(" ")}`}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      <Link href={`/admin/planos/${i.plan.id}`} className="block truncate text-silver hover:text-frost">
                        {i.plan.name}
                      </Link>
                      {i.problem && <ToneBadge tone="brass" className="mt-1">{i.problem}</ToneBadge>}
                    </TableCell>
                    <TableCell className="tabular-nums text-steel">{formatDate(i.anchorDate)}</TableCell>
                    <TableCell>
                      {i.preferredTechnician ? (
                        <span className="inline-flex items-center gap-2 text-silver">
                          <span className="size-2 rounded-full" style={{ background: i.preferredTechnician.color }} aria-hidden />
                          {i.preferredTechnician.name}
                        </span>
                      ) : (
                        <span className="text-steel">Padrão do cliente</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-silver">{i.next ? formatDate(i.next) : <span className="text-steel">—</span>}</TableCell>
                    <TableCell className="tabular-nums text-steel">{i.lastGeneratedDueDate ? formatDate(i.lastGeneratedDueDate) : "Nenhuma"}</TableCell>
                    <TableCell className="pr-5 text-right">
                      {!closed && (
                        <span className="inline-flex items-center gap-0.5">
                          <EditItemButton
                            item={{
                              id: i.id,
                              label: i.label,
                              maintenancePlanId: i.maintenancePlanId,
                              anchorDate: i.anchorDate,
                              preferredTechnicianId: i.preferredTechnicianId,
                              openWorkOrders: openByItem.get(i.id) ?? 0,
                            }}
                            plans={plans}
                            technicians={technicians}
                          />
                          <RemoveItemButton itemId={i.id} label={i.label} futureCount={futureByItem.get(i.id) ?? 0} />
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        {removedItems.length > 0 && (
          <details className="border-t border-rime px-5 py-3 text-sm">
            <summary className="cursor-pointer text-steel hover:text-silver">
              {plural(removedItems.length, "equipamento removido", "equipamentos removidos")} do contrato
            </summary>
            <ul className="mt-2 space-y-1">
              {removedItems.map((i) => (
                <li key={i.id} className="flex flex-wrap justify-between gap-2 text-steel">
                  <Link href={`/admin/equipamentos/${i.equipment.id}`} className="hover:text-frost">
                    {formatEquipmentCode(i.equipment.code)} {[i.equipment.type?.name, i.equipment.location].filter(Boolean).join(", ")}
                  </Link>
                  <span className="tabular-nums">{i.removedAt ? `removido em ${formatDate(i.removedAt)}` : ""}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Próximas OMs"
          description={`OMs em aberto dos equipamentos deste contrato. Novas saem com ${settings.workOrderHorizonDays} dias de antecedência.`}
          flush
        >
          {wos.length === 0 ? (
            <EmptyState
              title="Nenhuma OM em aberto"
              description={
                isActive
                  ? "As próximas visitas ainda estão fora do horizonte de geração. Use Gerar OMs agora para conferir."
                  : "Contratos parados não geram OMs."
              }
            />
          ) : (
            <ul className="divide-y divide-rime">
              {wos.slice(0, 8).map((w) => {
                const date = w.scheduledDate ?? w.dueDate;
                const late = date && date < today;
                return (
                  <li key={w.id}>
                    <Link href={`/admin/oms/${w.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ice/5">
                      <div className="w-12 shrink-0 text-center leading-tight">
                        <span className={late ? "block text-lg font-semibold tabular-nums text-gauge-red" : "block text-lg font-semibold tabular-nums text-silver"}>
                          {date ? date.slice(8, 10) : "—"}
                        </span>
                        <span className="block text-[0.7rem] capitalize text-steel">{date ? monthAbbr(date) : ""}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-silver">
                          <span className="tabular-nums text-steel">{formatOM(w.number)}</span>{" "}
                          {[formatEquipmentCode(w.equipmentCode), w.equipmentLocation].filter(Boolean).join(", ")}
                        </p>
                        <p className="truncate text-xs text-steel">
                          {w.technicianName ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="size-1.5 rounded-full" style={{ background: w.technicianColor ?? undefined }} aria-hidden />
                              {w.technicianName}
                            </span>
                          ) : (
                            "Sem técnico"
                          )}
                        </p>
                      </div>
                      <WorkOrderStatusBadge status={w.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {wos.length > 8 && (
            <p className="border-t border-rime px-5 py-3 text-xs text-steel">E mais {wos.length - 8} OMs em aberto.</p>
          )}
        </Panel>

        <Panel
          title="Mensalidades"
          description={`Geradas ${settings.invoiceLeadDays} dias antes de cada vencimento.`}
          actions={
            <Link
              href={`/admin/financeiro/receber?q=${encodeURIComponent(c.customer.name)}`}
              className="inline-flex items-center gap-1 text-xs text-ice hover:underline"
            >
              Contas a receber
              <ArrowUpRight className="size-3.5" />
            </Link>
          }
          flush
        >
          {recs.length === 0 ? (
            <EmptyState
              title="Nenhuma mensalidade gerada"
              description={
                isActive
                  ? `A primeira sai ${settings.invoiceLeadDays} dias antes do vencimento (dia ${c.billingDay}).`
                  : "Contratos parados não geram mensalidades."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Competência</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="pr-5">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recs.slice(0, 8).map((r) => {
                  const status = effectiveFinanceStatus(r.status, r.dueDate, today);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-5 text-silver">{r.competence ? capitalize(formatCompetence(r.competence)) : r.description}</TableCell>
                      <TableCell className="tabular-nums text-steel">{formatDate(r.dueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums text-silver">{formatBRL(r.amount - r.discount)}</TableCell>
                      <TableCell className="text-right tabular-nums text-steel">
                        {r.paidAt ? (
                          <>
                            {formatBRL(r.paidAmount)}
                            <span className="block text-[0.7rem]">{formatDate(r.paidAt)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="pr-5">
                        <ReceivableStatusBadge status={status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {recs.length > 8 && (
            <p className="border-t border-rime px-5 py-3 text-xs text-steel">
              Mostrando as 8 mais recentes.{" "}
              <Link href={`/admin/financeiro/receber?q=${encodeURIComponent(c.customer.name)}`} className="text-ice hover:underline">
                Ver todas em contas a receber
              </Link>
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
