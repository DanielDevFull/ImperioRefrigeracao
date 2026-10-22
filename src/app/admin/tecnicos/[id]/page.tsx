import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, MessageCircle, Package, Pencil, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart } from "@/components/charts/bar-chart";
import { BarList } from "@/components/charts/bar-list";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { WorkOrderStatusBadge, WorkOrderTypeBadge } from "@/components/system/status";
import { ToneBadge, toneText } from "@/components/system/tone-badge";
import { todayISO } from "@/lib/dates";
import {
  formatBRL,
  formatDate,
  formatDocument,
  formatNumber,
  formatOM,
  formatPhone,
  formatTime,
  parseISODate,
  whatsappLink,
} from "@/lib/format";
import { commissionStatus, labelOf, workOrderType } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { createVehicleStock } from "../actions";
import { Absences } from "../_components/absences";
import { ActiveToggle } from "../_components/active-toggle";
import { AppAccess } from "../_components/app-access";
import { PlateTag, SkillChips, TechAvatar } from "../_components/tech-avatar";
import {
  getProfileStats,
  getTechnician,
  lastLogin,
  listAbsences,
  performance,
  recentCompleted,
  upcomingWorkOrders,
  vehicleStock,
} from "../_lib/queries";
import { requireStaff } from "@/lib/auth/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/admin/tecnicos/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Técnico" };
  const t = await getTechnician(id);
  return { title: t?.name ?? "Técnico" };
}

const weekdayShort = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

function minutesLabel(min: number | null) {
  if (min == null) return "—";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

export default async function TecnicoPage({ params }: PageProps<"/admin/tecnicos/[id]">) {
  await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTechnician(id);
  if (!t) notFound();
  const today = todayISO();

  const [stats, agenda, history, absences, stock, login, perf] = await Promise.all([
    getProfileStats(id),
    upcomingWorkOrders(id),
    recentCompleted(id),
    listAbsences(id),
    vehicleStock(id),
    lastLogin(t.userId),
    performance(id),
  ]);

  const wa = whatsappLink(t.phone, `Olá, ${t.name.split(" ")[0]}!`);
  const monthsData = perf.months.map((m) => ({
    mes: monthShort.format(parseISODate(`${m.month}-15`)).replace(".", ""),
    concluidas: m.done,
  }));
  const totalPerf = perf.months.reduce((s, m) => s + m.done, 0);

  return (
    <>
      <Link
        href="/admin/tecnicos"
        className="mb-3 inline-flex items-center gap-1 text-sm text-steel transition-colors hover:text-frost"
      >
        <ChevronLeft className="size-4" />
        Técnicos
      </Link>

      <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <TechAvatar name={t.name} color={t.color} size="lg" muted={!t.active} />
          <div className="min-w-0">
            <h1 className="font-display text-silver-brushed truncate text-2xl font-semibold tracking-[0.02em] md:text-[2rem] md:leading-tight">
              {t.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {t.active ? <ToneBadge tone="mint">Ativo</ToneBadge> : <ToneBadge tone="steel">Inativo</ToneBadge>}
              {!t.userId ? (
                <ToneBadge tone="steel">Sem acesso ao app</ToneBadge>
              ) : t.banned ? (
                <ToneBadge tone="red">App bloqueado</ToneBadge>
              ) : (
                <ToneBadge tone="ice">Usa o app</ToneBadge>
              )}
              {t.vehiclePlate && <PlateTag plate={t.vehiclePlate} />}
              <SkillChips skills={t.skills} max={6} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ActiveToggle id={t.id} name={t.name} active={t.active} withLabel className="mr-2" />
          {wa && (
            <Button asChild variant="outline" size="lg">
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle className="text-mint" />
                WhatsApp
              </a>
            </Button>
          )}
          <Button asChild size="lg">
            <Link href={`/admin/tecnicos/${t.id}/editar`}>
              <Pencil />
              Editar técnico
            </Link>
          </Button>
        </div>
      </header>

      <ReadoutBand
        className="mb-6 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1"
        items={[
          { label: "OMs concluídas no mês", value: stats.doneMonth, tone: "mint" },
          {
            label: "Tempo médio de atendimento",
            value: Math.round(stats.avgMinutes ?? 0),
            hint: stats.durationSample
              ? "minutos por OM nos últimos 90 dias"
              : "sem OMs com início e fim registrados",
          },
          {
            label: "Avaliação média",
            value: Math.round((stats.ratingAvg ?? 0) * 10) / 10,
            format: "number",
            hint: stats.ratingCount ? `de 5, em ${stats.ratingCount} avaliações` : "sem avaliações ainda",
          },
          {
            label: "Comissão do mês",
            value: stats.commissionMonth,
            format: "brl",
            href: `/admin/comissoes?tecnico=${t.id}`,
            hint: "ver extrato",
          },
          {
            label: "Comissão a receber",
            value: stats.commissionToReceive,
            format: "brl",
            tone: stats.commissionToReceive > 0 ? "ice" : undefined,
            hint: stats.commissionPending > 0 ? `mais ${formatBRL(stats.commissionPending)} previstos` : "liberada e ainda não fechada",
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-6">
          {/* Agenda próxima */}
          <Panel
            flush
            title="Agenda próxima"
            description="Próximas OMs atribuídas, as atrasadas primeiro."
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/agenda">Abrir agenda</Link>
              </Button>
            }
          >
            {agenda.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="size-6 text-frost" />}
                title="Nenhuma OM agendada"
                description="Atribua OMs abertas a este técnico pela agenda ou pela lista de OMs."
                action={
                  <Button asChild variant="outline">
                    <Link href="/admin/oms">Ver OMs abertas</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-rime">
                {agenda.map((w) => {
                  const day = w.scheduledDate ?? w.dueDate;
                  const late = Boolean(w.scheduledDate && w.scheduledDate < today);
                  const isToday = w.scheduledDate === today;
                  return (
                    <li key={w.id}>
                      <Link
                        href={`/admin/oms/${w.id}`}
                        className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-ice/[0.04]"
                      >
                        <div
                          className={cn(
                            "grid w-12 shrink-0 place-items-center rounded-lg py-1.5 text-center ring-1",
                            late
                              ? "bg-gauge-red/10 ring-gauge-red/30"
                              : isToday
                                ? "bg-ice/12 ring-ice/35"
                                : "bg-night/60 ring-rime",
                          )}
                        >
                          {day ? (
                            <>
                              <span className="text-[0.65rem] text-steel">
                                {weekdayShort.format(parseISODate(day)).replace(".", "")}
                              </span>
                              <span
                                className={cn(
                                  "readout text-lg font-semibold leading-tight",
                                  late ? "text-gauge-red" : "text-silver",
                                )}
                              >
                                {day.slice(8, 10)}
                              </span>
                              <span className="text-[0.65rem] text-steel">
                                {monthShort.format(parseISODate(day)).replace(".", "")}
                              </span>
                            </>
                          ) : (
                            <span className="py-2 text-xs text-steel">Sem data</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="readout text-xs text-ice">{formatOM(w.number)}</span>
                            {w.scheduledTime && (
                              <span className="readout text-xs text-steel">{formatTime(w.scheduledTime)}</span>
                            )}
                            {late && <span className="text-xs text-gauge-red">Atrasada</span>}
                            {isToday && <span className="text-xs text-ice">Hoje</span>}
                          </div>
                          <p className="truncate text-sm text-silver">{w.title}</p>
                          <p className="truncate text-xs text-steel">{w.customerName}</p>
                        </div>
                        <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
                          <WorkOrderStatusBadge status={w.status} />
                          <WorkOrderTypeBadge type={w.type} />
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-steel/60" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* Histórico */}
          <Panel flush title="Histórico" description="Últimas OMs concluídas.">
            {history.length === 0 ? (
              <EmptyState
                title="Nenhuma OM concluída ainda"
                description="As OMs concluídas por este técnico aparecem aqui, com duração, avaliação e comissão."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="hidden pl-5 sm:table-cell">Concluída em</TableHead>
                    <TableHead className="pl-5 sm:pl-2">OM</TableHead>
                    <TableHead className="text-right">Duração</TableHead>
                    <TableHead className="text-right">Avaliação</TableHead>
                    <TableHead className="pr-5 text-right">Comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((w) => {
                    const minutes =
                      w.startedAt && w.finishedAt && w.finishedAt > w.startedAt
                        ? (w.finishedAt.getTime() - w.startedAt.getTime()) / 60000
                        : null;
                    return (
                      <TableRow key={w.id}>
                        <TableCell className="hidden pl-5 tabular-nums text-steel sm:table-cell">
                          {formatDate(w.finishedAt)}
                        </TableCell>
                        <TableCell className="max-w-[20rem] pl-5 sm:pl-2">
                          <Link href={`/admin/oms/${w.id}`} className="group block min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="readout text-xs text-ice group-hover:underline">{formatOM(w.number)}</span>
                              <span className={cn("text-xs", toneText[labelOf(workOrderType, w.type).tone])}>
                                {labelOf(workOrderType, w.type).label}
                              </span>
                            </span>
                            <span className="block max-w-[11rem] truncate text-sm text-silver sm:max-w-none">{w.customerName}</span>
                            <span className="block text-xs tabular-nums text-steel sm:hidden">{formatDate(w.finishedAt)}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-silver">{minutesLabel(minutes)}</TableCell>
                        <TableCell className="text-right">
                          {w.rating ? (
                            <span className="inline-flex items-center gap-1 tabular-nums text-silver">
                              <Star className="size-3.5 fill-brass text-brass" />
                              {w.rating}
                            </span>
                          ) : (
                            <span className="text-steel">—</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-5 text-right">
                          {w.commission != null ? (
                            <div className="flex flex-col items-end">
                              <span className="tabular-nums text-silver">{formatBRL(w.commission)}</span>
                              {w.commissionStatus && (
                                <span className={cn("text-xs", toneText[labelOf(commissionStatus, w.commissionStatus).tone])}>
                                  {labelOf(commissionStatus, w.commissionStatus).label}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-steel">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Panel>

          {/* Desempenho */}
          <Panel title="Desempenho" description="OMs concluídas nos últimos 6 meses.">
            {totalPerf === 0 ? (
              <EmptyState
                title="Sem OMs concluídas no período"
                description="O gráfico aparece quando o técnico concluir as primeiras OMs."
                className="py-8"
              />
            ) : (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <div>
                  <p className="mb-2 text-xs text-steel">Por mês</p>
                  <BarChart
                    data={monthsData}
                    xKey="mes"
                    series={[{ key: "concluidas", label: "OMs concluídas" }]}
                    format="integer"
                    height={220}
                  />
                </div>
                <div>
                  <p className="mb-3 text-xs text-steel">Por tipo de OM</p>
                  <BarList
                    format="integer"
                    items={perf.perType.map((p) => ({
                      label: labelOf(workOrderType, p.type).label,
                      value: p.n,
                      hint: `${Math.round((p.n / totalPerf) * 100)}%`,
                    }))}
                  />
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Ficha">
            <dl className="space-y-3 text-sm">
              {[
                { label: "Celular", value: t.phone ? formatPhone(t.phone) : null },
                { label: "E-mail", value: t.email },
                { label: "CPF", value: t.document ? formatDocument(t.document) : null },
                { label: "Admissão", value: t.admissionDate ? formatDate(t.admissionDate) : null },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-steel">{row.label}</dt>
                  <dd className={cn("min-w-0 truncate text-right tabular-nums", row.value ? "text-silver" : "text-steel/70")}>
                    {row.value ?? "Não informado"}
                  </dd>
                </div>
              ))}
            </dl>
            {t.notes && (
              <p className="mt-4 whitespace-pre-line border-t border-rime pt-3 text-sm text-steel">{t.notes}</p>
            )}
          </Panel>

          <Panel title="Acesso ao app">
            <AppAccess
              technicianId={t.id}
              name={t.name.split(" ")[0]}
              hasUser={Boolean(t.userId)}
              loginEmail={t.loginEmail}
              banned={Boolean(t.banned)}
              lastLogin={login ? login.toISOString() : null}
              defaultEmail={t.email}
            />
          </Panel>

          <Panel title="Ausências" description="Folgas, férias e afastamentos.">
            <Absences
              technicianId={t.id}
              today={today}
              absences={absences.map((a) => ({
                id: a.id,
                startDate: a.startDate,
                endDate: a.endDate,
                reason: a.reason,
                scheduledInside: a.scheduledInside,
              }))}
            />
          </Panel>

          <Panel
            flush
            title="Estoque do veículo"
            description={stock.locations.length ? stock.locations.map((l) => l.name).join(", ") : undefined}
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/estoque">Abrir estoque</Link>
              </Button>
            }
          >
            {stock.locations.length === 0 ? (
              <EmptyState
                icon={<Package className="size-6 text-frost" />}
                title="Sem estoque no veículo"
                description={
                  t.vehiclePlate
                    ? "Crie o estoque embarcado para controlar os materiais que o técnico leva e baixar o consumo nas OMs."
                    : "Cadastre a placa do veículo para criar o estoque embarcado."
                }
                action={
                  t.vehiclePlate ? (
                    <ConfirmAction
                      action={createVehicleStock.bind(null, t.id)}
                      title="Criar estoque do veículo?"
                      description={`Um local de estoque "Veículo ${t.vehiclePlate}" será criado para ${t.name.split(" ")[0]}. Depois transfira os materiais do almoxarifado em Estoque.`}
                      confirmLabel="Criar estoque"
                      variant="outline"
                      size="default"
                    >
                      <Package />
                      Criar estoque do veículo
                    </ConfirmAction>
                  ) : (
                    <Button asChild variant="outline">
                      <Link href={`/admin/tecnicos/${t.id}/editar`}>Cadastrar placa</Link>
                    </Button>
                  )
                }
                className="py-10"
              />
            ) : stock.items.length === 0 ? (
              <EmptyState
                title="Veículo sem materiais"
                description="Transfira materiais do almoxarifado para o veículo na tela de Estoque."
                action={
                  <Button asChild variant="outline">
                    <Link href="/admin/estoque">Transferir materiais</Link>
                  </Button>
                }
                className="py-10"
              />
            ) : (
              <ul className="max-h-[26rem] divide-y divide-rime overflow-y-auto">
                {stock.items.map((it) => (
                  <li key={`${it.locationId}-${it.productId}`}>
                    <Link
                      href={`/admin/estoque/${it.productId}`}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-ice/[0.04]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-silver">{it.name}</span>
                        {it.sku && <span className="readout block text-xs text-steel">{it.sku}</span>}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-sm tabular-nums",
                          it.quantity < 0 ? "text-gauge-red" : "text-silver",
                        )}
                      >
                        {formatNumber(it.quantity)}
                        <span className="ml-1 text-xs text-steel">{it.unit}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
