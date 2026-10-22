import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ChevronRight, Plus, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { workOrderPhotos, workOrders } from "@/db/schema";
import { EmptyState } from "@/components/system/empty-state";
import { PageHeader } from "@/components/system/page-header";
import { DetailList, Panel } from "@/components/system/panel";
import { QrCode } from "@/components/system/qr-code";
import { EquipmentStatusBadge } from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { requireCustomer } from "@/lib/auth/session";
import { addressLine, formatBTU, formatDate, formatEquipmentCode, formatPhone, formatTime } from "@/lib/format";
import { getSettings } from "@/server/settings";
import { DateChip, EquipmentTile, HealthMeter } from "../../_components/bits";
import { DownloadQrButton, PrintButton } from "../../_components/print-tools";
import { capitalize, firstName, formatWeekday, isUuid, workOrderTypeForCustomer } from "../../_lib/copy";
import { equipmentQrUrl, getEquipmentOverview } from "../../_lib/data";

export const metadata: Metadata = { title: "Equipamento" };

const printCss = `
@media print {
  @page { margin: 12mm; }
  body * { visibility: hidden !important; }
  #etiqueta, #etiqueta * { visibility: visible !important; }
  #etiqueta { position: fixed; left: 0; top: 0; width: 70mm; box-shadow: none !important; }
}`;

export default async function EquipamentoPage({ params }: PageProps<"/portal/equipamentos/[id]">) {
  const { customer } = await requireCustomer();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const overview = await getEquipmentOverview(customer.id);
  const item = overview.find((i) => i.equipment.id === id);
  if (!item) notFound();

  const [history, settings] = await Promise.all([
    db.query.workOrders.findMany({
      where: and(eq(workOrders.customerId, customer.id), eq(workOrders.equipmentId, id), eq(workOrders.status, "concluida")),
      with: {
        technician: { columns: { name: true } },
        photos: { orderBy: [asc(workOrderPhotos.createdAt)], limit: 4 },
      },
      orderBy: [desc(workOrders.finishedAt)],
      limit: 24,
    }),
    getSettings(),
  ]);

  const e = item.equipment;
  const name = [e.brand, e.model].filter(Boolean).join(" ") || e.type?.name || "Equipamento";
  const code = formatEquipmentCode(e.code);
  const visits = item.visits.slice(0, 4);

  return (
    <div>
      <style>{printCss}</style>
      <PageHeader
        back={{ href: "/portal/equipamentos", label: "Equipamentos" }}
        title={
          <span className="flex items-center gap-3.5">
            <EquipmentTile icon={e.type?.icon} size="lg" className="hidden sm:grid" />
            <span>{name}</span>
          </span>
        }
        meta={
          <>
            <EquipmentStatusBadge status={e.status} />
            {e.type?.name && <span className="text-sm text-steel">{e.type.name}</span>}
            {e.location && <span className="text-sm text-steel">{e.location}</span>}
            <span className="readout text-sm text-steel/80">{code}</span>
          </>
        }
        actions={
          <Button asChild size="lg" className="h-10 px-4">
            <Link href={`/portal/atendimentos/novo?equipmentId=${e.id}`}>
              <Plus /> Solicitar atendimento<span className="hidden sm:inline"> para este equipamento</span>
            </Link>
          </Button>
        }
      />

      {/* Cobertura do plano e saúde */}
      <section className="panel mb-6 flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={
              item.plan
                ? "grid size-9 shrink-0 place-items-center rounded-full bg-mint/12 text-mint ring-1 ring-mint/30"
                : "grid size-9 shrink-0 place-items-center rounded-full bg-steel/10 text-steel ring-1 ring-steel/25"
            }
          >
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0">
            {item.plan ? (
              <>
                <p className="text-sm font-medium text-silver">{item.plan.planName}</p>
                <p className="text-xs text-steel">
                  {item.plan.contractName}
                  {item.plan.intervalMonths
                    ? `. Uma visita a cada ${item.plan.intervalMonths === 1 ? "mês" : `${item.plan.intervalMonths} meses`}${item.plan.isPmoc ? ", dentro do PMOC" : ""}.`
                    : ""}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-silver">Fora do plano de manutenção</p>
                <p className="text-xs text-steel">Inclua este aparelho no seu plano para ter visitas programadas e histórico completo.</p>
              </>
            )}
          </div>
        </div>
        <HealthMeter health={item.health} showHint className="sm:w-56 sm:shrink-0" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Panel title="Dados do equipamento">
            <DetailList
              className="grid-cols-2"
              items={[
                { label: "Tipo", value: e.type?.name ?? "—" },
                { label: "Marca e modelo", value: name },
                { label: "Capacidade", value: <span className="readout">{formatBTU(e.capacityBtu)}</span> },
                { label: "Gás refrigerante", value: e.refrigerant ?? "—" },
                { label: "Tensão", value: e.voltage ?? "—" },
                { label: "Nº de série", value: <span className="readout">{e.serialNumber ?? "—"}</span> },
                { label: "Ambiente", value: e.location ?? "—" },
                { label: "Endereço", value: e.site ? `${e.site.name}${addressLine(e.site) ? `, ${addressLine(e.site)}` : ""}` : "—" },
                { label: "Instalado em", value: formatDate(e.installDate) },
                { label: "Garantia até", value: formatDate(e.warrantyUntil) },
              ]}
            />
          </Panel>

          <Panel
            title="Próximas visitas"
            description={item.plan ? "Datas agendadas e previstas pelo seu plano, com o que será feito em cada uma." : undefined}
            flush
          >
            {visits.length === 0 ? (
              <EmptyState
                className="py-10"
                title={item.plan ? "Nenhuma visita prevista" : "Este equipamento não está em um plano"}
                description={
                  item.plan
                    ? "A próxima visita aparece aqui quando for programada."
                    : "Com um plano de manutenção, a Imperium agenda as visitas e você acompanha tudo por aqui."
                }
              />
            ) : (
              <ul className="divide-y divide-rime">
                {visits.map((v) => (
                  <li key={`${v.source}-${v.date}-${v.workOrderId ?? ""}`} className="flex gap-4 px-5 py-4">
                    <DateChip date={v.date} tone={v.source === "om" ? "violet" : "frost"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-silver">
                          {capitalize(formatWeekday(v.date))}
                          {v.time ? `, às ${formatTime(v.time)}` : ""}
                        </p>
                        {v.source === "om" ? (
                          <ToneBadge tone="violet">Agendada</ToneBadge>
                        ) : (
                          <ToneBadge tone="frost">Prevista</ToneBadge>
                        )}
                      </div>
                      {v.technician && <p className="mt-0.5 text-xs text-steel">Técnico {v.technician}</p>}
                      {v.tasks.length > 0 && (
                        <ul className="mt-2.5 grid gap-x-4 gap-y-1 text-xs text-silver/85 sm:grid-cols-2">
                          {v.tasks.map((t) => (
                            <li key={t} className="flex gap-2">
                              <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-ice/70" />
                              {t}
                            </li>
                          ))}
                        </ul>
                      )}
                      {v.workOrderId && (
                        <Link href={`/portal/atendimentos/${v.workOrderId}`} className="mt-2.5 inline-flex items-center gap-0.5 text-xs text-frost hover:underline">
                          Ver atendimento <ChevronRight className="size-3.5" />
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Histórico de atendimentos" description={history.length ? `${history.length} atendimento${history.length === 1 ? "" : "s"} concluído${history.length === 1 ? "" : "s"}` : undefined}>
            {history.length === 0 ? (
              <EmptyState
                className="py-8"
                title="Nenhum atendimento concluído ainda"
                description="Depois da primeira visita, o histórico com o que foi feito fica registrado aqui."
              />
            ) : (
              <ol className="relative space-y-6">
                <span aria-hidden className="absolute bottom-3 left-[0.3rem] top-3 w-px bg-rime-strong" />
                {history.map((w) => (
                  <li key={w.id} className="relative flex gap-4">
                    <span className="relative mt-1.5 size-2.5 shrink-0 rounded-full bg-mint ring-4 ring-night" />
                    <Link href={`/portal/atendimentos/${w.id}`} className="group min-w-0 flex-1 rounded-xl p-1 -m-1 transition-colors hover:bg-ice/5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className="text-sm font-medium text-silver">{workOrderTypeForCustomer[w.type] ?? w.type}</p>
                        <p className="readout text-xs text-steel">{formatDate(w.finishedAt)}</p>
                      </div>
                      {firstName(w.technician?.name) && (
                        <p className="text-xs text-steel">Técnico {firstName(w.technician?.name)}</p>
                      )}
                      {w.solution && <p className="mt-1.5 line-clamp-3 text-sm text-silver/85">{w.solution}</p>}
                      {w.photos.length > 0 && (
                        <div className="mt-2.5 flex gap-2">
                          {w.photos.map((p) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={p.id} src={p.url} alt={p.caption ?? "Foto do atendimento"} loading="lazy" className="size-14 rounded-lg object-cover ring-1 ring-rime" />
                          ))}
                        </div>
                      )}
                      <span className="mt-2 inline-flex items-center gap-0.5 text-xs text-frost opacity-80 group-hover:opacity-100">
                        Ver detalhes <ChevronRight className="size-3.5" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-[0.95rem] font-semibold text-silver">Etiqueta QR</h2>
            <p className="mt-0.5 text-xs text-steel">
              Cole no aparelho. Quem escanear vê os dados e o histórico de manutenção dele.
            </p>
            <div
              id="etiqueta"
              className="mx-auto mt-4 w-full max-w-[15rem] rounded-2xl bg-white p-4 text-center text-[#0a1428] shadow-[0_20px_40px_-24px_rgb(56_168_255/0.6)]"
            >
              <div id="etiqueta-qr" className="flex justify-center">
                <QrCode value={equipmentQrUrl(e.qrToken)} size={176} />
              </div>
              <p className="mt-2 font-display text-sm font-bold tracking-[0.08em]">{settings.companyName.split(" ")[0]}</p>
              <p className="readout text-xs font-semibold">{code}</p>
              <p className="mt-0.5 truncate text-[0.7rem] text-[#3a4a66]">
                {name}
                {e.location ? `, ${e.location}` : ""}
              </p>
              {settings.whatsapp && <p className="mt-1 text-[0.65rem] text-[#3a4a66]">Suporte {formatPhone(settings.whatsapp)}</p>}
            </div>
            <p className="mt-4 text-xs text-steel">
              Baixe o QR para mandar imprimir em adesivo, ou imprima a etiqueta direto daqui.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <DownloadQrButton targetId="etiqueta-qr" fileName={`etiqueta-${code}`} className="w-full" />
              <PrintButton label="Imprimir etiqueta" className="w-full" />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
