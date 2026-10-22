import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  ExternalLink,
  FileSignature,
  FileText,
  Gauge,
  History,
  Navigation,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { ConfirmAction } from "@/components/system/confirm-action";
import { PageHeader } from "@/components/system/page-header";
import { DetailList, Panel } from "@/components/system/panel";
import { QrCode } from "@/components/system/qr-code";
import {
  ContractStatusBadge,
  EquipmentStatusBadge,
  WorkOrderStatusBadge,
  WorkOrderTypeBadge,
} from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { diffDays } from "@/lib/dates";
import {
  addressLine,
  formatBTU,
  formatContractCode,
  formatCustomerCode,
  formatDate,
  formatDayMonth,
  formatEquipmentCode,
  formatLongDate,
  formatOM,
  mapsLink,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConfirmAndGo } from "../../clientes/_components/confirm-go";
import { deleteEquipment, markEquipmentRemoved, reactivateEquipment, regenerateQrToken } from "../actions";
import { RefrigerantTag, isPhaseOut } from "../_components/refrigerant";
import { TypeIcon } from "../_components/type-icon";
import { intervalLabel } from "../_lib/forecast";
import { getEquipmentDetail, getEquipmentForEdit, type EquipmentDetail } from "../_lib/queries";

export async function generateMetadata({ params }: PageProps<"/admin/equipamentos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const e = await getEquipmentForEdit(id);
  return { title: e ? formatEquipmentCode(e.code) : "Equipamento" };
}

export default async function EquipamentoPage({ params }: PageProps<"/admin/equipamentos/[id]">) {
  const { id } = await params;
  const d = await getEquipmentDetail(id);
  if (!d) notFound();
  const { item, active } = d;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const publicUrl = `${appUrl}/e/${item.qrToken}`;
  const customerLabel = item.customer.tradeName || item.customer.name;
  const removed = item.status === "removido";
  const hasHistory = d.done.length + d.openOrders.length + d.cancelled > 0 || item.contractLinks.length > 0;
  const warranty = item.warrantyUntil
    ? item.warrantyUntil >= d.today
      ? { tone: "mint" as const, label: "Em garantia" }
      : { tone: "steel" as const, label: "Garantia vencida" }
    : null;
  const maps = item.site ? mapsLink(item.site) : null;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/equipamentos", label: "Equipamentos" }}
        title={
          <span className="flex items-center gap-3.5">
            <TypeIcon icon={item.type?.icon} size="lg" className="hidden sm:inline-grid" />
            <span>{item.type?.name ?? "Equipamento"}</span>
          </span>
        }
        description={
          [[item.brand, item.model].filter(Boolean).join(" "), item.capacityBtu ? formatBTU(item.capacityBtu) : null]
            .filter(Boolean)
            .join(", ") || "Marca e modelo não informados"
        }
        meta={
          <>
            <span className="rounded-md bg-glacier px-2 py-0.5 text-xs font-medium tabular-nums text-frost/90 ring-1 ring-rime">
              {formatEquipmentCode(item.code)}
            </span>
            <EquipmentStatusBadge status={item.status} />
            {isPhaseOut(item.refrigerant) && <RefrigerantTag value={item.refrigerant} />}
            <Link
              href={`/admin/clientes/${item.customer.id}`}
              className="rounded-md px-2 py-0.5 text-xs text-ice ring-1 ring-ice/25 transition-colors hover:bg-ice/10 hover:text-frost"
            >
              {customerLabel}
            </Link>
            {item.location && <span className="text-xs text-steel">{item.location}</span>}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href={`/admin/equipamentos/${item.id}/editar`}>
                <Pencil />
                Editar
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={`/admin/equipamentos/etiquetas?ids=${item.id}`}>
                <Printer />
                Imprimir etiqueta
              </Link>
            </Button>
            {!removed && (
              <Button asChild size="lg">
                <Link href={`/admin/oms/nova?customerId=${item.customer.id}&equipmentId=${item.id}`}>
                  <Plus />
                  Nova OM
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Dados técnicos">
            <DetailList
              columns={3}
              className="grid-cols-2"
              items={[
                { label: "Tipo", value: item.type?.name ?? "—" },
                { label: "Marca", value: item.brand ?? "—" },
                { label: "Modelo", value: item.model ?? "—" },
                {
                  label: "Número de série",
                  value: item.serialNumber ? <span className="font-mono text-[0.82rem]">{item.serialNumber}</span> : "—",
                },
                { label: "Capacidade", value: <span className="tabular-nums">{formatBTU(item.capacityBtu)}</span> },
                { label: "Fluido refrigerante", value: <RefrigerantTag value={item.refrigerant} /> },
                { label: "Tensão", value: item.voltage ?? "—" },
                { label: "Ambiente", value: item.location ?? "—" },
                { label: "Local", value: item.site?.name ?? "Sem local definido" },
                { label: "Instalação", value: formatDate(item.installDate) },
                {
                  label: "Garantia até",
                  value: item.warrantyUntil ? (
                    <span className="inline-flex items-center gap-2">
                      {formatDate(item.warrantyUntil)}
                      {warranty && <ToneBadge tone={warranty.tone}>{warranty.label}</ToneBadge>}
                    </span>
                  ) : (
                    "—"
                  ),
                },
                { label: "Cadastrado em", value: formatDate(item.createdAt) },
              ]}
            />
            {item.notes && (
              <div className="mt-5 border-t border-rime pt-4">
                <p className="text-xs text-steel">Observações</p>
                <p className="mt-1 whitespace-pre-line text-sm text-silver/90">{item.notes}</p>
              </div>
            )}
          </Panel>

          <ForecastPanel d={d} />
          <HistoryPanel d={d} />
        </div>

        <aside className="space-y-6" aria-label="Etiqueta, cobertura e ações">
          <section className="glass frost-edge rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[0.95rem] font-semibold text-silver">Etiqueta QR</h2>
                <p className="mt-0.5 text-xs text-steel">Leva à página pública do aparelho.</p>
              </div>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-ice hover:text-frost"
              >
                Abrir
                <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="mt-4 flex flex-col items-center">
              <div className="rounded-2xl bg-white p-3 shadow-[0_0_40px_rgb(56_168_255/0.18)]">
                <QrCode value={publicUrl} size={176} className="rounded-none" />
              </div>
              <p className="mt-3 font-mono text-sm tracking-wider text-silver">{formatEquipmentCode(item.code)}</p>
              <p className="max-w-full truncate text-xs text-steel">{publicUrl.replace(/^https?:\/\//, "")}</p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button asChild variant="outline" size="lg">
                <Link href={`/admin/equipamentos/etiquetas?ids=${item.id}`}>
                  <Printer />
                  Imprimir
                </Link>
              </Button>
              <ConfirmAction
                action={regenerateQrToken.bind(null, item.id)}
                title="Gerar um novo QR?"
                description="A etiqueta colada no aparelho deixa de funcionar na hora. Use quando a etiqueta for perdida ou copiada indevidamente, e imprima a nova em seguida."
                confirmLabel="Gerar novo QR"
                success="Novo QR gerado"
                size="lg"
              >
                <RefreshCw />
                Novo QR
              </ConfirmAction>
            </div>
          </section>

          <Panel title="Cobertura">
            {active ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-steel">Contrato</p>
                  <Link href={`/admin/contratos/${active.contract.id}`} className="font-medium text-silver hover:text-frost">
                    {active.contract.name}
                  </Link>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs tabular-nums text-steel">{formatContractCode(active.contract.code)}</span>
                    <ContractStatusBadge status={active.contract.status} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-steel">Plano de manutenção</p>
                  <Link href={`/admin/planos/${active.plan.id}`} className="font-medium text-silver hover:text-frost">
                    {active.plan.name}
                  </Link>
                  <p className="text-xs text-steel">
                    {intervalLabel(active.plan.tasks)}, {active.plan.tasks.length}{" "}
                    {active.plan.tasks.length === 1 ? "tarefa" : "tarefas"}
                    {active.plan.isPmoc ? ", atende ao PMOC" : ""}
                  </p>
                </div>
                <DetailList
                  columns={2}
                  items={[
                    { label: "Âncora da agenda", value: formatDate(active.anchorDate) },
                    { label: "Técnico preferencial", value: active.preferredTechnician?.name ?? "Do cliente" },
                  ]}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-silver">Atendimento avulso</p>
                <p className="text-sm text-steel">
                  Este aparelho não está em nenhum contrato, então não recebe visitas preventivas automáticas.
                </p>
                {!removed && (
                  <Button asChild variant="outline" size="lg" className="w-full">
                    <Link href={`/admin/contratos/novo?customerId=${item.customer.id}`}>
                      <FileSignature />
                      Criar contrato para o cliente
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Cliente e local">
            <div className="space-y-3">
              <div>
                <Link href={`/admin/clientes/${item.customer.id}`} className="font-medium text-silver hover:text-frost">
                  {customerLabel}
                </Link>
                <p className="text-xs tabular-nums text-steel">{formatCustomerCode(item.customer.code)}</p>
              </div>
              {item.site ? (
                <div>
                  <p className="text-sm text-silver/90">{item.site.name}</p>
                  <p className="text-sm text-steel">{addressLine(item.site) || "Endereço não informado"}</p>
                  {item.site.accessNotes && <p className="mt-2 text-xs text-steel">{item.site.accessNotes}</p>}
                  {maps && (
                    <a
                      href={maps}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm text-ice hover:text-frost"
                    >
                      <Navigation className="size-3.5" />
                      Abrir rota no Google Maps
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-steel">Sem local definido. Edite o equipamento para escolher o local.</p>
              )}
            </div>
          </Panel>

          {item.photoUrl && (
            <Panel title="Foto" flush>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.photoUrl} alt={`Foto do equipamento ${formatEquipmentCode(item.code)}`} className="aspect-[4/3] w-full object-cover" />
            </Panel>
          )}

          <Panel title={removed ? "Equipamento removido" : "Retirar de operação"}>
            {removed ? (
              <div className="space-y-3">
                <p className="text-sm text-steel">
                  O histórico continua disponível. Reative se o aparelho voltou a funcionar no cliente; a cobertura do
                  contrato precisa ser refeita em Contratos.
                </p>
                <ConfirmAction
                  action={reactivateEquipment.bind(null, item.id)}
                  title="Reativar este equipamento?"
                  description="Ele volta para a lista de aparelhos em operação do cliente."
                  confirmLabel="Reativar"
                  success="Equipamento reativado"
                  size="lg"
                  className="w-full"
                >
                  <ArchiveRestore />
                  Reativar equipamento
                </ConfirmAction>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-steel">
                  Aparelho trocado ou retirado do cliente? Marque como removido: o histórico fica guardado e as visitas
                  preventivas param.
                </p>
                <ConfirmAction
                  action={markEquipmentRemoved.bind(null, item.id)}
                  title="Marcar como removido?"
                  description={
                    active
                      ? `O equipamento sai do contrato ${formatContractCode(active.contract.code)} e para de gerar visitas preventivas. ${
                          d.openOrders.length
                            ? `Há ${d.openOrders.length} OM(s) em aberto: cancele-as em Ordens de manutenção se não forem mais necessárias.`
                            : ""
                        }`
                      : "O equipamento deixa de aparecer como em operação. O histórico de OMs continua disponível."
                  }
                  confirmLabel="Marcar como removido"
                  success="Equipamento marcado como removido"
                  size="lg"
                  className="w-full"
                >
                  <Archive />
                  Marcar como removido
                </ConfirmAction>
              </div>
            )}
            {!hasHistory && (
              <div className="mt-4 border-t border-rime pt-4">
                <p className="mb-2 text-xs text-steel">Sem nenhum histórico: se foi cadastrado por engano, pode ser excluído.</p>
                <ConfirmAndGo
                  action={deleteEquipment.bind(null, item.id)}
                  title="Excluir este equipamento?"
                  description="O cadastro e a etiqueta QR deixam de existir. Esta ação não pode ser desfeita."
                  confirmLabel="Excluir equipamento"
                  redirectTo={`/admin/clientes/${item.customer.id}?tab=equipamentos`}
                  destructive
                  variant="ghost"
                  className="text-gauge-red hover:text-gauge-red"
                >
                  <Trash2 />
                  Excluir equipamento
                </ConfirmAndGo>
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

function ForecastPanel({ d }: { d: EquipmentDetail }) {
  const { active, item } = d;
  if (!active) {
    return (
      <Panel title="Próximas visitas">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-glacier text-steel ring-1 ring-rime">
            <CalendarClock className="size-4" />
          </span>
          <p className="text-sm text-steel">
            Sem previsão: o aparelho não tem plano de manutenção. Inclua-o num contrato para que as visitas sejam geradas
            sozinhas, ou abra uma OM avulsa quando precisar.
          </p>
        </div>
      </Panel>
    );
  }
  if (item.status === "removido") return null;
  return (
    <Panel
      title="Próximas visitas"
      description={`${intervalLabel(active.plan.tasks)} pelo plano ${active.plan.name}. Cada visita traz as tarefas que vencem nela.`}
      flush
    >
      {d.forecast.length === 0 ? (
        <p className="px-5 py-6 text-sm text-steel">
          Nenhuma visita prevista: o contrato termina antes da próxima data ou o plano está sem tarefas.
        </p>
      ) : (
        <ol className="divide-y divide-rime">
          {d.forecast.map((v, i) => {
            const shown = v.workOrder?.scheduledDate ?? v.scheduled;
            const days = diffDays(d.today, shown);
            return (
              <li key={v.date} className="grid gap-3 px-5 py-4 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-start">
                <div>
                  <p className={cn("text-[1.05rem] font-semibold tabular-nums", i === 0 ? "text-ice" : "text-silver")}>
                    {formatDate(shown)}
                  </p>
                  <p className="text-xs text-steel first-letter:uppercase">
                    {formatLongDate(shown).split(",")[0]}, {days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`}
                  </p>
                  {shown !== v.date && (
                    <p className="text-[0.7rem] text-steel/80">Vencimento do plano {formatDayMonth(v.date)}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-steel">
                    {v.tasks.length} {v.tasks.length === 1 ? "tarefa" : "tarefas"}
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {v.tasks.map((t, ti) => (
                      <li
                        key={t.id}
                        className={cn(
                          "rounded-md bg-night/70 px-2 py-0.5 text-xs text-silver/85 ring-1 ring-rime",
                          ti >= 3 && "hidden sm:block",
                        )}
                      >
                        {t.title}
                      </li>
                    ))}
                    {v.tasks.length > 3 && (
                      <li className="rounded-md px-2 py-0.5 text-xs text-steel ring-1 ring-rime sm:hidden">
                        mais {v.tasks.length - 3}
                      </li>
                    )}
                  </ul>
                </div>
                <div className="sm:text-right">
                  {v.workOrder ? (
                    <Link href={`/admin/oms/${v.workOrder.id}`} className="inline-flex flex-col items-start gap-1 sm:items-end">
                      <span className="text-xs tabular-nums text-ice hover:text-frost">{formatOM(v.workOrder.number)}</span>
                      <WorkOrderStatusBadge status={v.workOrder.status} />
                    </Link>
                  ) : (
                    <span className="text-xs text-steel">Prevista</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

function HistoryPanel({ d }: { d: EquipmentDetail }) {
  const forecastIds = new Set(d.forecast.map((v) => v.workOrder?.id).filter(Boolean));
  const open = d.openOrders.filter((w) => !forecastIds.has(w.id));
  return (
    <Panel
      title="Histórico de serviços"
      description={
        d.done.length
          ? `${d.done.length} ${d.done.length === 1 ? "atendimento concluído" : "atendimentos concluídos"}`
          : "Os atendimentos concluídos aparecem aqui com as medições registradas."
      }
    >
      {open.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs text-steel">Em aberto</p>
          <ul className="space-y-2">
            {open.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/admin/oms/${w.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-night/50 px-3 py-2 ring-1 ring-rime transition-colors hover:bg-ice/5"
                >
                  <span className="text-xs tabular-nums text-ice">{formatOM(w.number)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-silver">{w.title}</span>
                  <span className="text-xs tabular-nums text-steel">{formatDate(w.scheduledDate ?? w.dueDate)}</span>
                  <WorkOrderStatusBadge status={w.status} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.done.length === 0 ? (
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-glacier text-steel ring-1 ring-rime">
            <History className="size-4" />
          </span>
          <p className="text-sm text-steel">Nenhum atendimento concluído ainda.</p>
        </div>
      ) : (
        <ol className="relative space-y-6 border-l border-rime pl-6">
          {d.done.map((w, i) => {
            const measures = w.tasks
              .filter((t) => t.measurementValue)
              .sort((a, b) => a.position - b.position);
            return (
              <li key={w.id} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-[31px] top-1 size-3 rounded-full ring-4 ring-abyss",
                    i === 0 ? "bg-mint shadow-[0_0_12px_rgb(62_224_181/0.6)]" : "bg-steel/60",
                  )}
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold tabular-nums text-silver">{formatDate(w.finishedAt)}</span>
                  <WorkOrderTypeBadge type={w.type} />
                  <WorkOrderStatusBadge status={w.status} />
                </div>
                <p className="mt-1 text-sm text-silver/90">{w.title}</p>
                <p className="text-xs text-steel">
                  {w.technician?.name ?? "Sem técnico"}, {formatOM(w.number)}
                  {w.tasks.length > 0 && `, checklist ${w.tasks.filter((t) => t.done).length}/${w.tasks.length}`}
                </p>
                {w.solution && <p className="mt-1.5 line-clamp-2 text-sm text-steel">{w.solution}</p>}
                {measures.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Medições">
                    {measures.map((t) => (
                      <li
                        key={t.id}
                        className="inline-flex items-center gap-1.5 rounded-md bg-ice/8 px-2 py-0.5 text-xs ring-1 ring-ice/20"
                      >
                        <Gauge className="size-3 text-ice" />
                        <span className="text-steel">{t.title}</span>
                        <span className="font-medium tabular-nums text-silver">
                          {t.measurementValue}
                          {t.measurementUnit ? ` ${t.measurementUnit}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex gap-4 text-xs">
                  <Link href={`/admin/oms/${w.id}`} className="text-ice hover:text-frost">
                    Ver OM
                  </Link>
                  <Link href={`/relatorios/om/${w.id}`} className="inline-flex items-center gap-1 text-ice hover:text-frost">
                    <FileText className="size-3" />
                    Relatório
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
