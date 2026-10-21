import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { Check, Circle, FileText, MessageCircle } from "lucide-react";
import { db } from "@/db";
import { workOrderEvents, workOrderPhotos, workOrders, workOrderTasks } from "@/db/schema";
import { PageHeader } from "@/components/system/page-header";
import { DetailList, Panel } from "@/components/system/panel";
import { PriorityBadge } from "@/components/system/status";
import { toneBg, toneText } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { requireCustomer } from "@/lib/auth/session";
import { addressLine, formatDateTime, formatLongDate, formatOM, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getSettings } from "@/server/settings";
import { CustomerStatusBadge, EquipmentIcon } from "../../_components/bits";
import { RatingDisplay, RatingForm } from "../../_components/rating";
import { capitalize, describeStatus, firstName, isUuid, RATING_LABELS, timelineLabel, workOrderTypeForCustomer } from "../../_lib/copy";
import { contactLink } from "../../_lib/data";

export const metadata: Metadata = { title: "Atendimento" };

const PHOTO_GROUPS: { kind: string; label: string }[] = [
  { kind: "problema", label: "Problema relatado" },
  { kind: "antes", label: "Antes" },
  { kind: "depois", label: "Depois" },
  { kind: "outro", label: "Outras fotos" },
];

export default async function AtendimentoPage({ params }: PageProps<"/portal/atendimentos/[id]">) {
  const { customer } = await requireCustomer();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const wo = await db.query.workOrders.findFirst({
    where: and(eq(workOrders.id, id), eq(workOrders.customerId, customer.id)),
    with: {
      technician: { columns: { name: true } },
      equipment: { with: { type: { columns: { name: true, icon: true } } } },
      site: true,
      tasks: { orderBy: [asc(workOrderTasks.position)] },
      photos: { orderBy: [asc(workOrderPhotos.createdAt)] },
      events: { orderBy: [asc(workOrderEvents.createdAt)] },
    },
  });
  if (!wo) notFound();

  const settings = await getSettings();
  const tech = firstName(wo.technician?.name);
  const status = describeStatus(wo, tech);
  const done = wo.status === "concluida";
  const eqName = wo.equipment
    ? [wo.equipment.brand, wo.equipment.model].filter(Boolean).join(" ") || wo.equipment.type?.name || "Equipamento"
    : null;
  const timeline = wo.events
    .map((e) => ({ e, l: timelineLabel(e, wo.origin) }))
    .filter((x): x is { e: (typeof wo.events)[number]; l: NonNullable<ReturnType<typeof timelineLabel>> } => x.l != null);
  const photos = PHOTO_GROUPS.map((g) => ({ ...g, items: wo.photos.filter((p) => p.kind === g.kind) })).filter((g) => g.items.length);
  const doneTasks = wo.tasks.filter((t) => t.done).length;
  const wa = contactLink(settings, `Olá! Sobre o atendimento ${formatOM(wo.number)}: `);

  return (
    <div>
      <PageHeader
        back={{ href: "/portal/atendimentos", label: "Atendimentos" }}
        title={wo.title}
        meta={
          <>
            <CustomerStatusBadge status={wo.status} />
            <span className="text-sm text-steel">{workOrderTypeForCustomer[wo.type] ?? wo.type}</span>
            <span className="readout text-sm text-steel/80">{formatOM(wo.number)}</span>
          </>
        }
      />

      {/* Estado atual em linguagem simples */}
      <section className="panel relative mb-6 overflow-hidden px-5 py-5 md:px-6">
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", toneBg[status.tone])} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className={cn("flex items-center gap-2 text-lg font-semibold", toneText[status.tone])}>
              {status.live && (
                <span className="relative flex size-2.5">
                  <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", toneBg[status.tone])} />
                  <span className={cn("relative inline-flex size-2.5 rounded-full", toneBg[status.tone])} />
                </span>
              )}
              {status.label}
            </p>
            <p className="mt-1 text-sm text-steel">{status.detail}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {done && (
              <Button asChild size="lg" className="h-10 px-4">
                <Link href={`/relatorios/om/${wo.id}`}>
                  <FileText /> Ver relatório completo
                </Link>
              </Button>
            )}
            {!done && wo.status !== "cancelada" && wa && (
              <Button asChild variant="outline" size="lg" className="h-10 px-4">
                <a href={wa} target="_blank" rel="noreferrer">
                  <MessageCircle /> Falar com a Imperium
                </a>
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_auto_1fr]">
        {done && (
          <section id="avaliar" className="panel scroll-mt-24 p-5 lg:col-start-2 lg:row-start-1">
            {wo.rating == null ? (
              <>
                <h2 className="font-display text-silver-brushed text-xl font-semibold">Como foi o atendimento?</h2>
                <p className="mb-4 mt-1 text-sm text-steel">
                  Sua nota ajuda {tech ?? "o técnico"} e a Imperium a melhorar. Leva só um instante.
                </p>
                <RatingForm workOrderId={wo.id} />
              </>
            ) : (
              <>
                <h2 className="font-display text-silver-brushed text-xl font-semibold">Sua avaliação</h2>
                <div className="mt-3 flex items-center gap-3">
                  <RatingDisplay value={wo.rating} className="[&_svg]:size-5" />
                  <span className="text-sm text-frost">{RATING_LABELS[wo.rating]}</span>
                </div>
                {wo.ratingComment && (
                  <blockquote className="mt-3 border-l-2 border-ice/40 pl-3 text-sm italic text-silver">
                    {wo.ratingComment}
                  </blockquote>
                )}
                <p className="mt-3 text-xs text-steel">Obrigado por avaliar.</p>
              </>
            )}
          </section>
        )}

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-3 lg:row-start-1">
          <Panel title="Resumo">
            <DetailList
              items={[
                {
                  label: done ? "Realizado em" : "Data da visita",
                  value: done
                    ? formatDateTime(wo.finishedAt)
                    : wo.scheduledDate
                      ? capitalize(formatLongDate(wo.scheduledDate))
                      : "A definir",
                },
                { label: "Horário", value: wo.scheduledTime ? formatTime(wo.scheduledTime) : done && wo.startedAt ? `Início às ${formatTime(wo.startedAt)}` : "A combinar" },
                { label: "Técnico", value: tech ?? "A definir" },
                {
                  label: "Equipamento",
                  value: wo.equipment ? (
                    <Link href={`/portal/equipamentos/${wo.equipment.id}`} className="inline-flex items-center gap-1.5 text-frost hover:underline">
                      <EquipmentIcon icon={wo.equipment.type?.icon} className="size-4" />
                      {eqName}
                      {wo.equipment.location ? `, ${wo.equipment.location}` : ""}
                    </Link>
                  ) : (
                    "Não informado"
                  ),
                },
                { label: "Local", value: wo.site ? `${wo.site.name}${addressLine(wo.site) ? `, ${addressLine(wo.site)}` : ""}` : "—" },
                { label: "Prioridade", value: <PriorityBadge value={wo.priority} /> },
              ]}
            />
            {wo.description && (
              <div className="mt-5 border-t border-rime pt-4">
                <p className="text-xs text-steel">{wo.origin === "portal_cliente" ? "O que você relatou" : "Descrição"}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-silver">{wo.description}</p>
              </div>
            )}
          </Panel>

          {wo.tasks.length > 0 && (
            <Panel
              title="Checklist da visita"
              description={done ? `${doneTasks} de ${wo.tasks.length} itens feitos` : `${wo.tasks.length} itens previstos`}
              flush
            >
              <ul className="divide-y divide-rime">
                {wo.tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 px-5 py-3">
                    {t.done ? (
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-mint/15 text-mint ring-1 ring-mint/30">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    ) : (
                      <Circle className="mt-0.5 size-5 shrink-0 text-steel/50" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", t.done ? "text-silver" : "text-steel")}>{t.title}</p>
                      {t.notes && <p className="mt-0.5 text-xs text-steel">{t.notes}</p>}
                    </div>
                    {t.measurementUnit && (
                      <span className="readout shrink-0 text-right text-sm tabular-nums text-frost">
                        {t.measurementValue ? `${t.measurementValue} ${t.measurementUnit}` : "—"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {photos.length > 0 && (
            <Panel title="Fotos">
              <div className="space-y-5">
                {photos.map((g) => (
                  <div key={g.kind}>
                    <p className="mb-2 text-xs text-steel">{g.label}</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {g.items.map((p) => (
                        <a
                          key={p.id}
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-rime"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.url}
                            alt={p.caption ?? g.label}
                            loading="lazy"
                            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {(wo.diagnosis || wo.solution || wo.signatureUrl || wo.signedByName) && (
            <Panel title="O que foi feito">
              <div className="space-y-4">
                {wo.diagnosis && (
                  <div>
                    <p className="text-xs text-steel">Diagnóstico</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-silver">{wo.diagnosis}</p>
                  </div>
                )}
                {wo.solution && (
                  <div>
                    <p className="text-xs text-steel">Solução</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-silver">{wo.solution}</p>
                  </div>
                )}
                {(wo.signatureUrl || wo.signedByName) && (
                  <div className="border-t border-rime pt-4">
                    <p className="text-xs text-steel">Assinatura de quem acompanhou</p>
                    {wo.signatureUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={wo.signatureUrl}
                        alt={`Assinatura de ${wo.signedByName ?? "responsável"}`}
                        className="mt-2 h-20 w-auto max-w-full rounded-lg bg-white/95 p-2"
                      />
                    )}
                    {wo.signedByName && <p className="mt-1.5 text-sm text-silver">{wo.signedByName}</p>}
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>

        <Panel title="Linha do tempo" className={cn("lg:col-start-2", done ? "lg:row-start-2" : "lg:row-start-1")}>
          {timeline.length === 0 ? (
            <p className="text-sm text-steel">Os próximos passos aparecem aqui.</p>
          ) : (
            <ol className="relative space-y-5">
              <span aria-hidden className="absolute bottom-2 left-[0.3rem] top-2 w-px bg-rime-strong" />
              {timeline.map(({ e, l }, i) => {
                const last = i === timeline.length - 1;
                return (
                  <li key={e.id} className="relative flex gap-3.5">
                    <span
                      className={cn(
                        "relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-night",
                        toneBg[l.tone],
                        last && "shadow-[0_0_10px_currentColor]",
                        last && toneText[l.tone],
                      )}
                    />
                    <div className="min-w-0">
                      <p className={cn("text-sm", last ? "font-medium text-silver" : "text-silver/85")}>{l.title}</p>
                      <p className="text-xs text-steel">{formatDateTime(e.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
