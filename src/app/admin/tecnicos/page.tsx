import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, MessageCircle, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { ToneBadge } from "@/components/system/tone-badge";
import { competenceOf, todayISO } from "@/lib/dates";
import { formatBRL, formatCompetence, formatNumber, formatPhone, whatsappLink } from "@/lib/format";
import { param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { ActiveToggle } from "./_components/active-toggle";
import { PlateTag, SkillChips, TechAvatar } from "./_components/tech-avatar";
import { listTeam, type TeamRow } from "./_lib/queries";

export const metadata: Metadata = { title: "Técnicos" };

const COLS =
  "lg:grid-cols-[minmax(0,2fr)_minmax(10.5rem,1.2fr)_6.5rem_7.5rem_6.5rem_5.5rem_7rem_3.25rem]";

export default async function TecnicosPage({ searchParams }: PageProps<"/admin/tecnicos">) {
  const sp = await searchParams;
  const status = param(sp, "status");
  const aviso = param(sp, "aviso");
  const team = await listTeam();
  const month = formatCompetence(competenceOf(todayISO()));

  const active = team.filter((t) => t.active);
  const rows = status === "ativos" ? active : status === "inativos" ? team.filter((t) => !t.active) : team;
  const done = active.reduce((s, t) => s + t.monthDone, 0);
  const planned = active.reduce((s, t) => s + t.monthTotal, 0);
  const ratingCount = team.reduce((s, t) => s + t.ratingCount, 0);
  const ratingAvg = ratingCount
    ? team.reduce((s, t) => s + (t.ratingAvg ?? 0) * t.ratingCount, 0) / ratingCount
    : 0;
  const commission = team.reduce((s, t) => s + t.commissionMonth, 0);

  return (
    <>
      <PageHeader
        title="Técnicos"
        description={`Equipe de campo: contato, especialidades, acesso ao app e produção de ${month}.`}
        actions={
          <Button asChild size="lg">
            <Link href="/admin/tecnicos/novo">
              <Plus />
              Novo técnico
            </Link>
          </Button>
        }
      />

      {aviso === "sem-tecnico" && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-brass/30 bg-brass/8 px-4 py-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-brass" />
          <p className="text-silver">
            Seu usuário não está vinculado a um técnico, por isso o app do técnico não abriu.
            <span className="text-steel"> Para testar o app, entre com o login de um técnico ou crie o acesso no cadastro dele.</span>
          </p>
        </div>
      )}

      {team.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nenhum técnico cadastrado"
            description="Cadastre a equipe de campo para atribuir OMs, controlar o estoque dos veículos e calcular comissões."
            action={
              <Button asChild>
                <Link href="/admin/tecnicos/novo">
                  <Plus />
                  Cadastrar primeiro técnico
                </Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <ReadoutBand
            className="mb-6"
            items={[
              { label: "Técnicos ativos", value: active.length, hint: `de ${team.length} cadastrados` },
              {
                label: "OMs concluídas no mês",
                value: done,
                hint: planned ? `de ${planned} previstas para a equipe` : "nenhuma OM prevista ainda",
                tone: "mint",
              },
              {
                label: "Avaliação média",
                value: Math.round(ratingAvg * 10) / 10,
                format: "number",
                hint: ratingCount ? `de 5, em ${ratingCount} avaliações` : "sem avaliações ainda",
              },
              {
                label: "Comissões do mês",
                value: commission,
                format: "brl",
                hint: "ver extrato",
                href: "/admin/comissoes",
              },
            ]}
          />

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <FilterTabs
              param="status"
              options={[
                { value: "", label: "Todos", count: team.length },
                { value: "ativos", label: "Ativos", count: active.length },
                { value: "inativos", label: "Inativos", count: team.length - active.length },
              ]}
            />
            <p className="text-xs text-steel">Técnicos inativos não recebem OMs automáticas.</p>
          </div>

          <Panel flush>
            {rows.length === 0 ? (
              <EmptyState
                title={status === "inativos" ? "Nenhum técnico inativo" : "Nenhum técnico ativo"}
                description={
                  status === "inativos"
                    ? "Toda a equipe está ativa e recebendo OMs."
                    : "Reative um técnico na lista completa ou cadastre um novo."
                }
                action={
                  <Button asChild variant="outline">
                    <Link href="/admin/tecnicos">Ver todos os técnicos</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <div
                  className={cn(
                    "hidden gap-4 border-b border-rime px-5 py-2.5 text-xs text-steel lg:grid",
                    COLS,
                  )}
                >
                  <span>Técnico</span>
                  <span>Contato</span>
                  <span>Veículo</span>
                  <span>App</span>
                  <span className="text-right">OMs no mês</span>
                  <span className="text-right">Avaliação</span>
                  <span className="text-right">Comissão</span>
                  <span className="text-right">Ativo</span>
                </div>
                <ul className="divide-y divide-rime">
                  {rows.map((t) => (
                    <TeamItem key={t.id} t={t} />
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

function AppBadge({ t }: { t: TeamRow }) {
  if (!t.userId) return <ToneBadge tone="steel">Sem acesso</ToneBadge>;
  if (t.banned) return <ToneBadge tone="red">Bloqueado</ToneBadge>;
  return <ToneBadge tone="mint">Com acesso</ToneBadge>;
}

function TeamItem({ t }: { t: TeamRow }) {
  const wa = whatsappLink(t.phone, `Olá, ${t.name.split(" ")[0]}!`);
  const pct = t.monthTotal ? Math.min(100, (t.monthDone / t.monthTotal) * 100) : 0;
  return (
    <li
      className={cn(
        "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors hover:bg-ice/[0.04] lg:gap-y-0",
        COLS,
        !t.active && "bg-abyss/30",
      )}
    >
      {/* Técnico */}
      <div className="order-1 flex min-w-0 items-center gap-3 lg:order-none">
        <TechAvatar name={t.name} color={t.color} muted={!t.active} />
        <div className="min-w-0">
          <Link
            href={`/admin/tecnicos/${t.id}`}
            className={cn(
              "block truncate font-medium after:absolute after:inset-0 hover:text-frost",
              t.active ? "text-silver" : "text-steel",
            )}
          >
            {t.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {!t.active && <ToneBadge tone="steel">Inativo</ToneBadge>}
            {t.skills.length ? (
              <SkillChips skills={t.skills} max={3} />
            ) : (
              t.active && <p className="text-xs text-steel/70">Sem especialidades cadastradas</p>
            )}
          </div>
        </div>
      </div>

      {/* Contato, veículo e app */}
      <div className="order-4 col-span-2 flex flex-wrap items-center gap-x-3 gap-y-2 lg:contents">
        <div className="min-w-0 text-sm">
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="relative z-10 inline-flex items-center gap-1.5 text-silver hover:text-mint"
              title="Conversar no WhatsApp"
            >
              <MessageCircle className="size-3.5 text-mint" />
              <span className="whitespace-nowrap tabular-nums">{formatPhone(t.phone)}</span>
            </a>
          ) : (
            <span className="text-steel">Sem telefone</span>
          )}
          {t.email && <p className="hidden truncate text-xs text-steel lg:block">{t.email}</p>}
        </div>
        <div>{t.vehiclePlate ? <PlateTag plate={t.vehiclePlate} /> : <span className="text-sm text-steel">—</span>}</div>
        <div>
          <AppBadge t={t} />
        </div>
      </div>

      {/* Números do mês */}
      <div className="order-3 col-span-2 grid grid-cols-3 gap-3 rounded-lg bg-night/50 px-3 py-2.5 ring-1 ring-rime lg:contents">
        <div className="lg:text-right">
          <p className="text-[0.7rem] text-steel lg:hidden">OMs no mês</p>
          <p className="text-sm tabular-nums text-silver">
            {t.monthDone}
            <span className="text-steel"> / {t.monthTotal}</span>
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ice/10 lg:ml-auto lg:w-16">
            <div className="h-full rounded-full bg-mint/80" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="lg:text-right">
          <p className="text-[0.7rem] text-steel lg:hidden">Avaliação</p>
          {t.ratingAvg != null ? (
            <p className="inline-flex items-center gap-1 text-sm tabular-nums text-silver">
              <Star className="size-3.5 fill-brass text-brass" />
              {formatNumber(Math.round(t.ratingAvg * 10) / 10)}
              <span className="text-xs text-steel">({t.ratingCount})</span>
            </p>
          ) : (
            <p className="text-sm text-steel">—</p>
          )}
        </div>
        <div className="lg:text-right">
          <p className="text-[0.7rem] text-steel lg:hidden">Comissão</p>
          <p className="text-sm tabular-nums text-silver">{formatBRL(t.commissionMonth)}</p>
        </div>
      </div>

      {/* Ativo */}
      <div className="order-2 flex justify-end lg:order-none">
        <ActiveToggle id={t.id} name={t.name} active={t.active} />
      </div>
    </li>
  );
}
