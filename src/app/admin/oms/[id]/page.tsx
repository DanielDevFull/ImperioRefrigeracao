import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { gte } from "drizzle-orm";
import { AirVent, CalendarDays, MapPin, Navigation, Phone, TriangleAlert, UserRound } from "lucide-react";
import { db } from "@/db";
import { technicianAbsences } from "@/db/schema";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { CommissionStatusBadge, PriorityBadge, ReceivableStatusBadge, WorkOrderTypeBadge } from "@/components/system/status";
import { todayISO } from "@/lib/dates";
import {
  addressLine,
  formatBRL,
  formatBTU,
  formatCustomerCode,
  formatDate,
  formatDateTime,
  formatEquipmentCode,
  formatLongDate,
  formatOM,
  formatPercent,
  formatPhone,
  formatTime,
  mapsLink,
} from "@/lib/format";
import { commissionBasis, effectiveFinanceStatus, labelOf, workOrderOrigin } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { WorkOrderStatus } from "@/server/core/work-order-flow";
import { ACTIVE_STATUSES } from "@/server/core/work-order-flow";
import { CHECKLIST_OPEN, isUuid } from "../_lib/constants";
import { loadWorkOrder } from "../_lib/detail";
import { activeTechnicians, materialOptions } from "../_lib/queries";
import { TechLabel } from "../_components/tech-label";
import { BillingDialog } from "./_components/billing-dialog";
import { Checklist } from "./_components/checklist";
import { Materials } from "./_components/materials";
import { NotesForm } from "./_components/notes-form";
import { OmActions } from "./_components/om-actions";
import { Photos } from "./_components/photos";
import { CreatedToast, StatusLive } from "./_components/status-live";
import { Timeline } from "./_components/timeline";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/admin/oms/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "OM não encontrada" };
  const data = await loadWorkOrder(id);
  return { title: data ? formatOM(data.wo.number) : "OM não encontrada" };
}

function Block({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-steel">
        <Icon className="size-3.5" />
        {label}
      </p>
      <div className="mt-1.5 space-y-0.5 text-sm">{children}</div>
    </div>
  );
}

export default async function OmDetailPage({ params }: PageProps<"/admin/oms/[id]">) {
  await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await loadWorkOrder(id);
  if (!data) notFound();
  const { wo, commissions, materialsCharged, techLocationId, absenceOnDate } = data;
  const status = wo.status as WorkOrderStatus;
  const today = todayISO();
  const closed = status === "concluida" || status === "cancelada";

  const [technicians, absences, options] = await Promise.all([
    activeTechnicians(),
    db.query.technicianAbsences.findMany({
      where: gte(technicianAbsences.endDate, today),
      columns: { technicianId: true, startDate: true, endDate: true, reason: true },
    }),
    closed ? Promise.resolve(null) : materialOptions(),
  ]);

  const late = (ACTIVE_STATUSES as readonly string[]).includes(status) && !!wo.scheduledDate && wo.scheduledDate < today;
  const site = wo.site;
  const route = site ? mapsLink(site) : null;
  const eqp = wo.equipment;
  const customerName = wo.customer.tradeName ?? wo.customer.name;
  const pendingTasks = wo.tasks.filter((t) => !t.done).length;
  const laborBilled = wo.billable ? wo.laborAmount : 0;
  const estimatedTotal = laborBilled + materialsCharged;
  const defaultLocationId = techLocationId ?? options?.locations.find((l) => l.type === "almoxarifado")?.id ?? null;

  const checklistEditable = CHECKLIST_OPEN.has(status);
  const lockedReason = checklistEditable
    ? null
    : status === "concluida"
      ? "OM concluída: reabra a OM para alterar o checklist."
      : status === "cancelada"
        ? "OM cancelada."
        : "O checklist é liberado quando o atendimento é iniciado.";

  return (
    <>
      <CreatedToast />
      <PageHeader
        back={{ href: "/admin/oms", label: "Ordens de manutenção" }}
        title={wo.title}
        meta={
          <>
            <span className="readout rounded-md bg-ice/10 px-2 py-0.5 text-sm font-semibold text-frost ring-1 ring-ice/25">{formatOM(wo.number)}</span>
            <StatusLive status={status} />
            <WorkOrderTypeBadge type={wo.type} />
            {wo.priority !== "normal" && <PriorityBadge value={wo.priority} />}
            <span className="text-xs text-steel">Origem: {labelOf(workOrderOrigin, wo.origin).label}</span>
          </>
        }
        actions={
          <OmActions
            id={wo.id}
            status={status}
            technicians={technicians}
            absences={absences}
            schedule={{ technicianId: wo.technicianId, scheduledDate: wo.scheduledDate, scheduledTime: wo.scheduledTime?.slice(0, 5) ?? null }}
            pendingTasks={pendingTasks}
          />
        }
      />

      {/* Ficha: cliente, local, equipamento e agendamento */}
      <section className="panel mb-6 grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Block icon={UserRound} label="Cliente">
          <Link href={`/admin/clientes/${wo.customer.id}`} className="block truncate font-medium text-silver hover:text-frost">
            {customerName}
          </Link>
          <p className="truncate text-xs text-steel">
            {formatCustomerCode(wo.customer.code)}
            {wo.customer.tradeName ? `, ${wo.customer.name}` : ""}
          </p>
          {(wo.customer.whatsapp || wo.customer.phone) && (
            <a href={`tel:${wo.customer.whatsapp ?? wo.customer.phone}`} className="inline-flex items-center gap-1 text-xs text-ice hover:text-frost">
              <Phone className="size-3" />
              {formatPhone(wo.customer.whatsapp ?? wo.customer.phone)}
            </a>
          )}
        </Block>
        <Block icon={MapPin} label="Local de atendimento">
          {site ? (
            <>
              <p className="truncate font-medium text-silver">{site.name}</p>
              <p className="text-xs text-steel">{addressLine(site) || "Endereço não informado"}</p>
              {site.accessNotes && <p className="text-xs text-brass/90">{site.accessNotes}</p>}
              {route && (
                <a href={route} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-ice hover:text-frost">
                  <Navigation className="size-3" />
                  Abrir rota no mapa
                </a>
              )}
            </>
          ) : (
            <p className="text-steel">Sem local definido</p>
          )}
        </Block>
        <Block icon={AirVent} label="Equipamento">
          {eqp ? (
            <>
              <Link href={`/admin/equipamentos/${eqp.id}`} className="block truncate font-medium text-silver hover:text-frost">
                {eqp.type?.name ?? "Equipamento"} {eqp.location ? `(${eqp.location})` : ""}
              </Link>
              <p className="truncate text-xs text-steel">
                {formatEquipmentCode(eqp.code)}
                {[eqp.brand, eqp.model].filter(Boolean).length ? `, ${[eqp.brand, eqp.model].filter(Boolean).join(" ")}` : ""}
              </p>
              <p className="truncate text-xs text-steel">
                {formatBTU(eqp.capacityBtu)}
                {eqp.refrigerant ? `, ${eqp.refrigerant}` : ""}
              </p>
            </>
          ) : (
            <p className="text-steel">Nenhum equipamento específico</p>
          )}
        </Block>
        <Block icon={CalendarDays} label="Agendamento">
          <TechLabel name={wo.technician?.name} color={wo.technician?.color} className="font-medium" />
          {wo.scheduledDate ? (
            <p className={cn("readout", late ? "text-gauge-red" : "text-silver")}>
              {formatLongDate(wo.scheduledDate)}
              {wo.scheduledTime ? `, ${formatTime(wo.scheduledTime)}` : ""}
              {late && <span className="ml-1.5 text-xs font-medium">(atrasada)</span>}
            </p>
          ) : (
            <p className="text-brass">Sem data agendada</p>
          )}
          {wo.dueDate && <p className="text-xs text-steel">Vencimento do plano: {formatDate(wo.dueDate)}</p>}
          {wo.startedAt && (
            <p className="text-xs text-steel">
              Início {formatDateTime(wo.startedAt)}
              {wo.finishedAt ? `, fim ${formatDateTime(wo.finishedAt)}` : ""}
            </p>
          )}
          {absenceOnDate && (
            <p className="flex items-start gap-1 text-xs text-brass">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              Técnico ausente nesta data{absenceOnDate.reason ? ` (${absenceOnDate.reason})` : ""}.
            </p>
          )}
        </Block>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-6">
          <Panel
            flush
            title="Checklist"
            description={wo.plan ? `Plano: ${wo.plan.name}${wo.plan.isPmoc ? " (PMOC)" : ""}` : "Itens a executar no atendimento"}
          >
            <Checklist
              tasks={wo.tasks.map((t) => ({
                id: t.id,
                title: t.title,
                instructions: t.instructions,
                measurementUnit: t.measurementUnit,
                measurementValue: t.measurementValue,
                requiresPhoto: t.requiresPhoto,
                done: t.done,
                notes: t.notes,
                doneAt: t.doneAt?.toISOString() ?? null,
              }))}
              editable={checklistEditable}
              lockedReason={lockedReason}
            />
          </Panel>

          <Panel flush title="Materiais" description="Baixa automática no estoque de origem; cancelar a OM devolve tudo.">
            <Materials
              id={wo.id}
              items={wo.materials.map((m) => ({
                id: m.id,
                productId: m.productId,
                productName: m.product.name,
                unit: m.product.unit,
                locationName: m.location?.name ?? null,
                quantity: m.quantity,
                unitPrice: m.unitPrice,
                chargeCustomer: m.chargeCustomer,
              }))}
              editable={!closed}
              options={options ?? { products: [], locations: [], balance: {} }}
              defaultLocationId={defaultLocationId}
              chargeByDefault={wo.billable}
            />
          </Panel>

          <Panel flush title="Fotos" description="Registro de antes, depois e problemas encontrados.">
            <Photos
              id={wo.id}
              canUpload={status !== "cancelada"}
              photos={wo.photos.map((p) => ({
                id: p.id,
                url: p.url,
                kind: p.kind,
                caption: p.caption,
                createdAt: p.createdAt.toISOString(),
                taskTitle: wo.tasks.find((t) => t.id === p.taskId)?.title ?? null,
              }))}
            />
          </Panel>

          <Panel title="Diagnóstico e solução" description="Preenchidos pelo técnico no app; a central pode complementar.">
            <NotesForm
              id={wo.id}
              values={{ description: wo.description, diagnosis: wo.diagnosis, solution: wo.solution, technicianNotes: wo.technicianNotes }}
            />
          </Panel>

          <Panel title="Assinatura do cliente">
            {wo.signatureUrl ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="rounded-lg bg-white p-3 ring-1 ring-rime">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={wo.signatureUrl} alt={`Assinatura de ${wo.signedByName ?? "cliente"}`} className="h-28 w-auto max-w-full object-contain" />
                </div>
                <div className="text-sm">
                  <p className="font-medium text-silver">{wo.signedByName ?? "Responsável não informado"}</p>
                  <p className="text-xs text-steel">Assinou no encerramento{wo.finishedAt ? ` em ${formatDateTime(wo.finishedAt)}` : ""}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-steel">
                {closed
                  ? "Atendimento encerrado sem assinatura do cliente."
                  : "Aguardando assinatura: o cliente assina no celular do técnico ao final do atendimento e ela sai no relatório."}
              </p>
            )}
          </Panel>
        </div>

        <aside className="min-w-0 space-y-6">
          <Panel title="Financeiro" actions={!closed ? <BillingDialog id={wo.id} laborAmount={wo.laborAmount} billable={wo.billable} /> : undefined}>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-steel">Mão de obra</dt>
                <dd className="readout text-silver">{formatBRL(wo.laborAmount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-steel">Materiais cobrados</dt>
                <dd className="readout text-silver">{formatBRL(materialsCharged)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-rime pt-2.5">
                <dt className="text-silver">{status === "concluida" ? "Total cobrado" : status === "cancelada" ? "Total" : "Total previsto"}</dt>
                <dd className="readout text-lg font-semibold text-silver">
                  {formatBRL(status === "concluida" ? wo.totalAmount : status === "cancelada" ? 0 : estimatedTotal)}
                </dd>
              </div>
              <p className="text-xs text-steel">
                {status === "cancelada"
                  ? "OM cancelada: nenhuma cobrança é gerada."
                  : wo.billable
                    ? "Faturável: gera conta a receber ao concluir."
                    : "Não faturável: coberto pelo contrato. Só materiais cobrados geram cobrança."}
              </p>
            </dl>
            {wo.receivable && (
              <Link
                href={`/admin/financeiro/receber?status=todas&q=${encodeURIComponent(formatOM(wo.number))}`}
                className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-night/50 px-3 py-2.5 ring-1 ring-rime transition hover:ring-ice/30"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-silver">Conta a receber</span>
                  <span className="readout block text-xs text-steel">
                    {formatBRL(wo.receivable.amount)}, vence {formatDate(wo.receivable.dueDate)}
                  </span>
                </span>
                <ReceivableStatusBadge status={effectiveFinanceStatus(wo.receivable.status, wo.receivable.dueDate, today)} />
              </Link>
            )}
          </Panel>

          <Panel flush title="Comissão">
            {commissions.length === 0 ? (
              <p className="px-5 py-4 text-sm text-steel">
                {status === "concluida"
                  ? "Nenhuma regra de comissão se aplicou a esta OM."
                  : status === "cancelada"
                    ? "OM cancelada: sem comissão."
                    : "A comissão é calculada quando a OM é concluída."}
              </p>
            ) : (
              <ul className="divide-y divide-rime/70">
                {commissions.map((c) => (
                  <li key={c.id} className="space-y-1.5 px-5 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <TechLabel name={c.technician.name} color={c.technician.color} className="text-sm" />
                      <CommissionStatusBadge status={c.status} />
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <p className="text-xs text-steel">
                        {c.basis === "fixo_por_om"
                          ? "Valor fixo por OM"
                          : `${formatPercent(c.rate / 100)} sobre ${formatBRL(c.baseAmount)}`}
                        <span className="block">{commissionBasis[c.basis]?.label}</span>
                      </p>
                      <span className="readout text-base font-semibold text-silver">{formatBRL(c.amount)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel flush title="Linha do tempo">
            <Timeline
              events={wo.events.map((e) => ({
                id: e.id,
                kind: e.kind,
                message: e.message,
                fromStatus: e.fromStatus,
                toStatus: e.toStatus,
                userName: e.user?.name ?? null,
                lat: e.lat,
                lng: e.lng,
                createdAt: e.createdAt,
              }))}
            />
          </Panel>
        </aside>
      </div>
    </>
  );
}
