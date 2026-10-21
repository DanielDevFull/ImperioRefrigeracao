import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  AirVent,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  Hourglass,
  MessageCircle,
  Navigation,
  Plus,
  Snowflake,
  TriangleAlert,
  UserRound,
  Wallet,
} from "lucide-react";
import { db } from "@/db";
import { receivables, workOrders } from "@/db/schema";
import { Emblem } from "@/components/brand/emblem";
import { SnowField } from "@/components/brand/snow-field";
import { EmptyState } from "@/components/system/empty-state";
import { Panel } from "@/components/system/panel";
import { ContractStatusBadge } from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { requireCustomer } from "@/lib/auth/session";
import { addDays, diffDays, todayISO } from "@/lib/dates";
import { formatBRL, formatCompetence, formatDate, formatTime } from "@/lib/format";
import { effectiveFinanceStatus, type Tone } from "@/lib/labels";
import { getSettings } from "@/server/settings";
import { CustomerStatusBadge, DateChip, EquipmentTile, HealthMeter, SectionTitle, ToneDot } from "./_components/bits";
import { PayButton } from "./_components/pay-button";
import { RatingDisplay } from "./_components/rating";
import { capitalize, firstName, formatDayMonthLong, formatWeekday, greeting, workOrderTypeForCustomer } from "./_lib/copy";
import { ACTIVE_STATUSES, contactLink, getCurrentContracts, getEquipmentOverview, nextVisitSummary } from "./_lib/data";
import { receivableTitle } from "./_lib/pay";

export const metadata: Metadata = { title: "Início" };

type Pending = {
  key: string;
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  detail: string;
  amount?: string;
  action: React.ReactNode;
};

export default async function PortalHome() {
  const { user, customer } = await requireCustomer();
  const today = todayISO();
  const weekEnd = addDays(today, 6);

  const [settings, contracts, overview, recs, active, toRate, recent] = await Promise.all([
    getSettings(),
    getCurrentContracts(customer.id),
    getEquipmentOverview(customer.id, today),
    db.query.receivables.findMany({
      where: and(eq(receivables.customerId, customer.id), inArray(receivables.status, ["aberto", "em_analise"])),
      orderBy: [asc(receivables.dueDate)],
    }),
    db.query.workOrders.findMany({
      where: and(eq(workOrders.customerId, customer.id), inArray(workOrders.status, ACTIVE_STATUSES)),
      with: {
        technician: { columns: { name: true } },
        equipment: { columns: { brand: true, model: true, location: true } },
      },
      orderBy: [asc(sql`coalesce(${workOrders.scheduledDate}, ${workOrders.dueDate})`)],
    }),
    db.query.workOrders.findMany({
      where: and(
        eq(workOrders.customerId, customer.id),
        eq(workOrders.status, "concluida"),
        isNull(workOrders.rating),
        gte(workOrders.finishedAt, new Date(`${addDays(today, -60)}T00:00:00-03:00`)),
      ),
      with: { equipment: { columns: { brand: true, model: true, location: true } } },
      orderBy: [desc(workOrders.finishedAt)],
      limit: 3,
    }),
    db.query.workOrders.findMany({
      where: and(eq(workOrders.customerId, customer.id), eq(workOrders.status, "concluida")),
      with: {
        technician: { columns: { name: true } },
        equipment: { columns: { brand: true, model: true, location: true } },
      },
      orderBy: [desc(workOrders.finishedAt)],
      limit: 4,
    }),
  ]);

  const name =
    (customer.personType === "pj" ? (customer.tradeName ?? customer.name) : firstName(customer.name)) ?? firstName(user.name) ?? "cliente";
  const hasPlan = contracts.length > 0;
  const since = contracts.reduce<string | null>((min, c) => (!min || c.startDate < min ? c.startDate : min), null);
  const eqLabel = (e: { brand: string | null; model: string | null; location: string | null } | null) =>
    e ? `${[e.brand, e.model].filter(Boolean).join(" ") || "Equipamento"}${e.location ? `, ${e.location}` : ""}` : null;

  // Próxima visita (por equipamento) + chamados sem equipamento já agendados
  let next = nextVisitSummary(overview);
  const loose = active.find((w) => !w.equipmentId && w.scheduledDate && w.scheduledDate >= today);
  if (loose?.scheduledDate && (!next || loose.scheduledDate < next.date)) {
    next = { date: loose.scheduledDate, time: loose.scheduledTime, equipmentCount: 0, technician: firstName(loose.technician?.name), confirmed: true };
  }

  // Pendências, em ordem de prioridade
  const pending: Pending[] = [];
  for (const r of recs) {
    const eff = effectiveFinanceStatus(r.status, r.dueDate, today);
    const title = capitalize(receivableTitle(r));
    const pay = <PayButton receivable={r} settings={settings} />;
    if (eff === "em_analise") {
      pending.push({
        key: r.id,
        tone: "brass",
        icon: <Hourglass />,
        title: "Comprovante em análise",
        detail: `${title}. A Imperium confere e confirma por aqui.`,
        amount: formatBRL(r.amount - r.discount),
        action: pay,
      });
    } else if (eff === "vencido") {
      const late = diffDays(r.dueDate, today);
      pending.push({
        key: r.id,
        tone: "red",
        icon: <TriangleAlert />,
        title: r.kind === "mensalidade" && r.competence ? `Mensalidade de ${formatCompetence(r.competence)} vencida` : `${title} vencida`,
        detail: `Venceu em ${formatDate(r.dueDate)}, há ${late} dia${late === 1 ? "" : "s"}.`,
        amount: formatBRL(r.amount - r.discount),
        action: pay,
      });
    } else {
      const left = diffDays(today, r.dueDate);
      pending.push({
        key: r.id,
        tone: left <= 5 ? "brass" : "frost",
        icon: <Wallet />,
        title: `${title} em aberto`,
        detail: left === 0 ? "Vence hoje." : `Vence em ${formatDate(r.dueDate)}${left <= 5 ? `, daqui a ${left} dia${left === 1 ? "" : "s"}` : ""}.`,
        amount: formatBRL(r.amount - r.discount),
        action: pay,
      });
    }
  }
  for (const w of active) {
    const tech = firstName(w.technician?.name);
    const eq_ = eqLabel(w.equipment);
    const follow = (
      <Button asChild variant="outline" size="lg" className="px-3.5">
        <Link href={`/portal/atendimentos/${w.id}`}>Acompanhar</Link>
      </Button>
    );
    if (w.status === "em_deslocamento" || w.status === "em_execucao") {
      pending.push({
        key: w.id,
        tone: "ice",
        icon: w.status === "em_deslocamento" ? <Navigation /> : <ClipboardList />,
        title: w.status === "em_deslocamento" ? `${tech ?? "O técnico"} está a caminho` : "Atendimento acontecendo agora",
        detail: eq_ ?? w.title,
        action: follow,
      });
    } else if (w.status === "agendada" && w.scheduledDate && w.scheduledDate >= today && w.scheduledDate <= weekEnd) {
      const when =
        w.scheduledDate === today
          ? "Visita hoje"
          : w.scheduledDate === addDays(today, 1)
            ? "Visita amanhã"
            : `Visita agendada para ${formatWeekday(w.scheduledDate)}, ${formatDate(w.scheduledDate).slice(0, 5)}`;
      pending.push({
        key: w.id,
        tone: "violet",
        icon: <CalendarClock />,
        title: `${when}${w.scheduledTime ? ` às ${formatTime(w.scheduledTime)}` : ""}`,
        detail: `${eq_ ?? w.title}${tech ? `, com ${tech}` : ""}`,
        action: follow,
      });
    } else if (["aberta", "aguardando_material", "pausada"].includes(w.status) && w.origin === "portal_cliente") {
      pending.push({
        key: w.id,
        tone: w.status === "aberta" ? "frost" : "brass",
        icon: <ClipboardList />,
        title: w.status === "aberta" ? "Chamado recebido, aguardando agendamento" : "Chamado aguardando peça",
        detail: w.title,
        action: follow,
      });
    }
  }
  for (const w of toRate) {
    pending.push({
      key: `rate-${w.id}`,
      tone: "frost",
      icon: <Snowflake />,
      title: `Avalie a visita de ${formatDate(w.finishedAt).slice(0, 5)}`,
      detail: eqLabel(w.equipment) ?? w.title,
      action: (
        <Button asChild variant="outline" size="lg" className="px-3.5">
          <Link href={`/portal/atendimentos/${w.id}#avaliar`}>Avaliar</Link>
        </Button>
      ),
    });
  }

  const wa = contactLink(
    settings,
    hasPlan ? "Olá! Sou cliente e preciso de ajuda." : "Olá! Quero conhecer os planos de manutenção da Imperium.",
  );
  const preview = overview.slice(0, 4);

  return (
    <div className="space-y-10">
      {/* Faixa de marca */}
      <section className="glass frost-edge relative overflow-hidden rounded-3xl">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(70%_90%_at_92%_-10%,rgb(56_168_255/0.26),transparent_65%),radial-gradient(55%_70%_at_0%_115%,rgb(22_119_214/0.22),transparent_70%)]"
        />
        <SnowField density="calm" interactive={false} />
        <Emblem size={340} className="pointer-events-none absolute -right-20 -top-16 hidden opacity-[0.05] lg:grid" />
        <div className="relative grid gap-7 px-5 py-7 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] md:items-end md:gap-10 md:px-10 md:py-10">
          <div className="min-w-0">
            <p className="text-sm text-frost/80">{greeting()}</p>
            <h1 className="font-display text-silver-brushed mt-1 text-[2.1rem] font-semibold leading-tight tracking-[0.02em] md:text-5xl">
              Olá, {name}
            </h1>
            {hasPlan ? (
              <ul className="mt-4 space-y-1.5">
                {contracts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[0.95rem] text-silver">{c.name}</span>
                    <ContractStatusBadge status={c.status} />
                  </li>
                ))}
                {since && <li className="text-xs text-steel">Cliente desde {formatCompetence(since.slice(0, 7))}</li>}
              </ul>
            ) : (
              <p className="mt-3 max-w-md text-sm text-steel">
                Aqui você acompanha seus equipamentos, atendimentos e pagamentos com a Imperium.
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild size="lg" className="h-11 px-4">
                <Link href="/portal/atendimentos/novo">
                  <Plus /> Solicitar atendimento
                </Link>
              </Button>
              {wa && (
                <Button asChild variant="outline" size="lg" className="h-11 bg-abyss/30 px-4">
                  <a href={wa} target="_blank" rel="noreferrer">
                    <MessageCircle /> WhatsApp
                  </a>
                </Button>
              )}
            </div>
          </div>

          {hasPlan ? (
            <div className="rounded-2xl bg-abyss/45 p-5 ring-1 ring-rime backdrop-blur-sm">
              {next ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-steel">Próxima visita</p>
                    <ToneBadge tone={next.confirmed ? "violet" : "frost"}>{next.confirmed ? "Agendada" : "Prevista"}</ToneBadge>
                  </div>
                  <p className="readout mt-2 text-[1.9rem] font-semibold leading-none text-silver">{formatDayMonthLong(next.date)}</p>
                  <p className="mt-1.5 text-sm text-frost/85">
                    {capitalize(formatWeekday(next.date))}
                    {next.time ? `, às ${formatTime(next.time)}` : ""}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-rime pt-3.5 text-sm text-silver">
                    {next.equipmentCount > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <AirVent className="size-4 text-ice" />
                        {next.equipmentCount} equipamento{next.equipmentCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {next.technician && (
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound className="size-4 text-ice" />
                        Técnico {next.technician}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-steel">Próxima visita</p>
                  <p className="mt-2 text-sm text-silver">Ainda sem data prevista.</p>
                  <p className="mt-1 text-xs text-steel">Assim que a próxima visita do plano for programada, ela aparece aqui.</p>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-abyss/45 p-5 ring-1 ring-ice/20 backdrop-blur-sm">
              <p className="font-display text-silver-brushed text-xl font-semibold">Plano de manutenção</p>
              <p className="mt-2 text-sm text-steel">
                Com um plano, a Imperium agenda as visitas, cuida da limpeza e das medições e você acompanha tudo por aqui,
                com mensalidade fixa e sem surpresa.
              </p>
              {wa && (
                <Button asChild size="lg" className="mt-4 h-11 w-full">
                  <a href={wa} target="_blank" rel="noreferrer">
                    <MessageCircle /> Conversar sobre um plano
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Pendências */}
      <section>
        <SectionTitle count={pending.length}>Pendências</SectionTitle>
        <Panel flush>
          {pending.length === 0 ? (
            <div className="flex items-center gap-4 px-5 py-5">
              <ToneDot tone="mint">
                <Check />
              </ToneDot>
              <div>
                <p className="text-sm font-medium text-silver">Tudo em dia</p>
                <p className="text-sm text-steel">Nenhuma cobrança em aberto e nenhuma visita nesta semana.</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-rime">
              {pending.map((p) => (
                <li key={p.key} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="flex min-w-0 flex-1 items-start gap-3.5 sm:items-center">
                    <ToneDot tone={p.tone}>{p.icon}</ToneDot>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-silver">{p.title}</p>
                      <p className="mt-0.5 text-sm text-steel">{p.detail}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 pl-[3.375rem] sm:justify-end sm:pl-0">
                    {p.amount && <span className="readout text-base font-semibold tabular-nums text-silver">{p.amount}</span>}
                    {p.action}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-6">
        {/* Equipamentos */}
        <section className="min-w-0">
          <SectionTitle href="/portal/equipamentos" linkLabel={overview.length > 4 ? `Ver todos (${overview.length})` : "Ver todos"}>
            Meus equipamentos
          </SectionTitle>
          <Panel flush>
            {preview.length === 0 ? (
              <EmptyState
                className="py-10"
                title="Nenhum equipamento cadastrado"
                description="Peça para a Imperium cadastrar seus aparelhos e acompanhe as manutenções por aqui."
              />
            ) : (
              <ul className="divide-y divide-rime">
                {preview.map((it) => {
                  const e = it.equipment;
                  return (
                    <li key={e.id}>
                      <Link href={`/portal/equipamentos/${e.id}`} className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-ice/5 sm:px-5">
                        <EquipmentTile icon={e.type?.icon} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-silver">
                            {[e.brand, e.model].filter(Boolean).join(" ") || e.type?.name || "Equipamento"}
                          </p>
                          <p className="truncate text-xs text-steel">{e.location ?? e.type?.name ?? "—"}</p>
                          <HealthMeter health={it.health} className="mt-1.5" />
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          <p className="text-steel">Próxima</p>
                          <p className="readout text-sm text-silver">{it.nextVisit ? formatDate(it.nextVisit.date).slice(0, 5) : "—"}</p>
                          <p className="mt-1 text-steel">
                            Último <span className="readout text-silver/80">{it.lastService?.date ? formatDate(it.lastService.date).slice(0, 5) : "—"}</span>
                          </p>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-steel/60" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </section>

        {/* Últimos atendimentos */}
        <section className="min-w-0">
          <SectionTitle href="/portal/atendimentos?aba=concluidos" linkLabel="Ver histórico">
            Últimos atendimentos
          </SectionTitle>
          <Panel flush>
            {recent.length === 0 ? (
              <EmptyState
                className="py-10"
                title="Nenhum atendimento concluído"
                description="Depois da primeira visita, o relatório fica disponível aqui."
                action={
                  <Button asChild variant="outline">
                    <Link href="/portal/atendimentos/novo">Solicitar atendimento</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-rime">
                {recent.map((w) => (
                  <li key={w.id}>
                    <Link href={`/portal/atendimentos/${w.id}`} className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-ice/5 sm:px-5">
                      <DateChip date={w.finishedAt ? todayISO(w.finishedAt) : null} tone="mint" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-silver">{workOrderTypeForCustomer[w.type] ?? w.type}</p>
                        <p className="truncate text-xs text-steel">{eqLabel(w.equipment) ?? w.title}</p>
                        {firstName(w.technician?.name) && (
                          <p className="text-xs text-steel/80">Técnico {firstName(w.technician?.name)}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {w.rating != null ? (
                          <RatingDisplay value={w.rating} />
                        ) : (
                          <CustomerStatusBadge status={w.status} />
                        )}
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-steel/60" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>
      </div>
    </div>
  );
}
