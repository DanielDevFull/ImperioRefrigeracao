import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronRight, KeyRound, MapPin, Navigation } from "lucide-react";
import { DetailList } from "@/components/system/panel";
import { PageHeader } from "@/components/system/page-header";
import { EquipmentStatusBadge, WorkOrderStatusBadge, WorkOrderTypeBadge } from "@/components/system/status";
import { toneOnTint } from "@/components/system/tone-badge";
import { requireTechnician } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import {
  addressLine,
  formatBTU,
  formatDate,
  formatDayMonth,
  formatEquipmentCode,
  formatOM,
  formatTime,
  mapsLink,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { customerName, equipmentForTechnician } from "../../_lib/queries";
import { OpenCorrective } from "./_components/open-corrective";

export const metadata: Metadata = { title: "Equipamento" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TechEquipmentPage({ params }: PageProps<"/tecnico/equipamento/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { technician } = await requireTechnician();
  const today = todayISO();
  const data = await equipmentForTechnician(id, technician.id, today);
  if (!data) notFound();
  const { equipment: e, mine, history, plan, forecast } = data;
  const site = e.site;
  const map = site ? mapsLink(site) : null;
  const typeName = e.type?.name ?? "Equipamento";
  const label = [typeName, e.location].filter(Boolean).join(" — ");

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/tecnico/escanear", label: "Escanear" }}
        title={typeName}
        description={[e.brand, e.model].filter(Boolean).join(" ") || "Marca e modelo não informados"}
        meta={
          <>
            <span className="readout text-sm text-steel">{formatEquipmentCode(e.code)}</span>
            <EquipmentStatusBadge status={e.status} />
          </>
        }
      />

      <section className="panel overflow-hidden" aria-label="Cliente e local">
        <div className="flex gap-3 p-4">
          <MapPin className="mt-0.5 size-5 shrink-0 text-ice" />
          <div className="min-w-0">
            <p className="text-[0.95rem] font-semibold text-silver">{customerName(e.customer)}</p>
            <p className="mt-0.5 text-sm text-steel">
              {[site?.name, e.location].filter(Boolean).join(", ") || "Local não informado"}
            </p>
            {site && <p className="mt-0.5 text-sm leading-relaxed text-steel">{addressLine(site)}</p>}
          </div>
        </div>
        {site?.accessNotes && (
          <p className="mx-4 mb-4 flex gap-2.5 rounded-xl bg-brass/10 px-3.5 py-3 text-sm leading-relaxed text-silver ring-1 ring-brass/25">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-brass" />
            <span>
              <span className={cn("font-semibold", toneOnTint.brass)}>Acesso: </span>
              {site.accessNotes}
            </span>
          </p>
        )}
        {map && (
          <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center gap-2 border-t border-rime text-sm font-medium text-ice active:bg-ice/10"
          >
            <Navigation className="size-4" />
            Abrir no mapa
          </a>
        )}
      </section>

      <section className="panel p-4" aria-label="Dados técnicos">
        <DetailList
          items={[
            { label: "Capacidade", value: e.capacityBtu ? formatBTU(e.capacityBtu) : "—" },
            { label: "Gás refrigerante", value: e.refrigerant ?? "—" },
            { label: "Tensão", value: e.voltage ?? "—" },
            { label: "Nº de série", value: e.serialNumber ?? "—" },
            { label: "Instalado em", value: formatDate(e.installDate) },
            {
              label: "Garantia",
              value: e.warrantyUntil ? (
                <span className={cn(e.warrantyUntil >= today ? "text-mint" : "text-steel")}>
                  {e.warrantyUntil >= today ? `até ${formatDate(e.warrantyUntil)}` : `vencida em ${formatDate(e.warrantyUntil)}`}
                </span>
              ) : (
                "—"
              ),
            },
          ]}
          className="grid-cols-2 sm:grid-cols-2"
        />
        {e.notes && <p className="mt-4 border-t border-rime pt-3 text-sm leading-relaxed text-steel">{e.notes}</p>}
      </section>

      <section aria-labelledby="minhas-oms" className="space-y-3">
        <h2 id="minhas-oms" className="font-display text-silver-brushed text-xl font-semibold">
          Suas OMs abertas
        </h2>
        {mine.length > 0 ? (
          <ul className="space-y-2">
            {mine.map((o) => (
              <li key={o.id}>
                <Link href={`/tecnico/om/${o.id}`} className="panel flex min-h-16 items-center gap-3 px-4 py-3 active:bg-ice/5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.95rem] font-medium text-silver">{o.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <WorkOrderStatusBadge status={o.status} />
                      <WorkOrderTypeBadge type={o.type} />
                      <span className="text-xs text-steel">
                        {o.scheduledDate
                          ? `${o.scheduledDate === today ? "Hoje" : formatDayMonth(o.scheduledDate)}${o.scheduledTime ? `, ${formatTime(o.scheduledTime)}` : ""}`
                          : "Sem data"}
                      </span>
                    </div>
                  </div>
                  <span className="readout shrink-0 text-xs text-steel">{formatOM(o.number)}</span>
                  <ChevronRight className="size-4 shrink-0 text-steel" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-steel">Nenhuma OM sua em aberto para este equipamento.</p>
        )}
        {e.status !== "removido" && <OpenCorrective equipmentId={e.id} label={label} />}
      </section>

      {plan && (
        <section aria-labelledby="proximas" className="space-y-3">
          <h2 id="proximas" className="font-display text-silver-brushed text-xl font-semibold">
            Próximas visitas
          </h2>
          <div className="panel p-4">
            <p className="text-sm text-steel">
              Plano <span className="text-silver">{plan.name}</span>
            </p>
            {forecast.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {forecast.map((d) => (
                  <li key={d} className="inline-flex items-center gap-1.5 rounded-xl bg-violet/10 px-3 py-2 text-sm text-violet ring-1 ring-violet/25">
                    <CalendarClock className="size-4" />
                    {formatDate(d)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-steel">Sem visitas previstas (contrato inativo).</p>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="historico" className="space-y-3">
        <h2 id="historico" className="font-display text-silver-brushed text-xl font-semibold">
          Histórico de serviços
        </h2>
        {history.length === 0 ? (
          <p className="panel px-4 py-5 text-sm text-steel">Nenhum atendimento concluído ainda. O primeiro registro aparece aqui.</p>
        ) : (
          <ol className="relative space-y-3 before:absolute before:inset-y-2 before:left-[0.4rem] before:w-px before:bg-rime">
            {history.map((h) => {
              const measures = h.tasks.filter((t) => t.measurementUnit && t.measurementValue);
              const isMine = h.technicianId === technician.id;
              const body = (
                <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-silver">{formatDate(h.finishedAt)}</span>
                    <WorkOrderTypeBadge type={h.type} />
                    <span className="text-xs text-steel">{isMine ? "por você" : `por ${h.technician?.name.split(" ")[0] ?? "técnico"}`}</span>
                  </div>
                  {h.solution && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-steel">{h.solution}</p>}
                  {measures.length > 0 && (
                    <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {measures.map((m) => (
                        <div key={m.title} className="min-w-0">
                          <dt className="truncate text-[0.7rem] text-steel">{m.title}</dt>
                          <dd className="readout text-sm font-medium text-frost">
                            {m.measurementValue} {m.measurementUnit}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </>
              );
              return (
                <li key={h.id} className="relative pl-6">
                  <span aria-hidden className="absolute left-0 top-4 size-[0.85rem] rounded-full bg-abyss ring-2 ring-mint/70" />
                  {isMine ? (
                    <Link href={`/tecnico/om/${h.id}`} className="panel block p-4 active:bg-ice/5">
                      {body}
                    </Link>
                  ) : (
                    <div className="panel p-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
