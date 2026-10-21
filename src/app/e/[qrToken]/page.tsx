import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  History,
  LogIn,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { db } from "@/db";
import { contractEquipment, customers, equipment, maintenancePlanTasks, workOrders } from "@/db/schema";
import { Emblem } from "@/components/brand/emblem";
import { SnowField } from "@/components/brand/snow-field";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { formatBTU, formatDate, formatEquipmentCode, formatLongDate, formatPhone, whatsappLink } from "@/lib/format";
import { activeWorkOrderStatuses, labelOf, workOrderType } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getSettings } from "@/server/settings";
import { TypeIcon } from "../../admin/equipamentos/_components/type-icon";
import { forecastVisits } from "../../admin/equipamentos/_lib/forecast";
import { validPmocFor } from "../../admin/equipamentos/_lib/queries";

const TOKEN_RE = /^[A-Za-z0-9_-]{6,64}$/;

/** Dados públicos do equipamento (sem documentos nem contatos do cliente). */
const loadPublic = cache(async (token: string) => {
  if (!TOKEN_RE.test(token)) return null;
  const item = await db.query.equipment.findFirst({
    where: eq(equipment.qrToken, token),
    columns: {
      id: true,
      code: true,
      brand: true,
      model: true,
      capacityBtu: true,
      location: true,
      status: true,
      customerId: true,
      siteId: true,
    },
    with: {
      type: { columns: { name: true, icon: true } },
      site: { columns: { name: true, district: true, city: true } },
      customer: { columns: { name: true, tradeName: true, personType: true, status: true } },
      contractLinks: {
        where: eq(contractEquipment.active, true),
        columns: { anchorDate: true, lastGeneratedDueDate: true },
        with: {
          contract: { columns: { startDate: true, endDate: true, status: true } },
          plan: { columns: { name: true, isPmoc: true }, with: { tasks: { orderBy: [asc(maintenancePlanTasks.position)] } } },
        },
      },
    },
  });
  return item ?? null;
});

export async function generateMetadata({ params }: PageProps<"/e/[qrToken]">): Promise<Metadata> {
  const { qrToken } = await params;
  const item = await loadPublic(qrToken);
  return {
    title: item ? `${item.type?.name ?? "Equipamento"} ${formatEquipmentCode(item.code)}` : "Etiqueta não encontrada",
    robots: { index: false, follow: false },
  };
}

const firstName = (name: string | null | undefined) => (name ? name.split(/\s+/)[0] : null);

export default async function PublicEquipmentPage({ params }: PageProps<"/e/[qrToken]">) {
  const { qrToken } = await params;
  const item = await loadPublic(qrToken);
  if (!item) notFound();

  const today = todayISO();
  const [settings, user, recent, open, pmoc] = await Promise.all([
    getSettings(),
    getCurrentUser(),
    db.query.workOrders.findMany({
      where: and(eq(workOrders.equipmentId, item.id), eq(workOrders.status, "concluida")),
      columns: { id: true, type: true, finishedAt: true },
      with: { technician: { columns: { name: true } } },
      orderBy: [desc(workOrders.finishedAt)],
      limit: 5,
    }),
    db.query.workOrders.findMany({
      where: and(eq(workOrders.equipmentId, item.id), inArray(workOrders.status, [...activeWorkOrderStatuses])),
      columns: { id: true, status: true, scheduledDate: true, dueDate: true },
    }),
    validPmocFor(item.customerId, item.siteId, today),
  ]);

  // Quem está olhando decide o próximo passo
  let ownerLink: { href: string; label: string } | null = null;
  if (user) {
    if (user.role === "admin" || user.role === "gestor")
      ownerLink = { href: `/admin/equipamentos/${item.id}`, label: "Abrir a ficha no sistema" };
    else if (user.role === "tecnico")
      ownerLink = { href: `/tecnico/equipamento/${item.id}`, label: "Abrir no app do técnico" };
    else {
      const mine = await db.query.customers.findFirst({
        where: eq(customers.userId, user.id),
        columns: { id: true },
      });
      if (mine?.id === item.customerId)
        ownerLink = { href: `/portal/equipamentos/${item.id}`, label: "Ver no meu portal" };
    }
  }

  const code = formatEquipmentCode(item.code);
  const typeName = item.type?.name ?? "Equipamento";
  const customerLabel = item.customer.tradeName || (item.customer.personType === "pj" ? item.customer.name : null);
  const place = [item.location, item.site?.name].filter(Boolean).join(", ");
  const removed = item.status === "removido";

  const live = open.find((w) => w.status === "em_deslocamento" || w.status === "em_execucao");
  const nextOpen = open
    .map((w) => w.scheduledDate ?? w.dueDate)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  const link = item.contractLinks[0];
  const forecast =
    !nextOpen && link && !removed
      ? forecastVisits(
          { anchorDate: link.anchorDate, contract: link.contract, plan: link.plan },
          today,
          1,
          link.lastGeneratedDueDate,
        )[0]
      : undefined;
  const next = nextOpen ?? forecast?.date ?? null;
  const last = recent[0];

  const contact = settings.whatsapp ?? settings.phone;
  const message = `Olá! Gostaria de solicitar atendimento para o equipamento ${code} (${typeName}${place ? `, ${place}` : ""}${customerLabel ? `, ${customerLabel}` : ""}).`;
  const wa = whatsappLink(contact, message);
  const showCustomerActions = !ownerLink;

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 h-[460px]">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 70% at 50% 20%, rgb(22 119 214 / 0.38), transparent 70%), radial-gradient(40% 40% at 50% 18%, rgb(56 168 255 / 0.2), transparent 70%)",
          }}
        />
        <SnowField density="calm" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-abyss" />
      </div>

      <div className="relative mx-auto w-full max-w-md px-5 pb-14 pt-10 [padding-top:max(2.5rem,env(safe-area-inset-top))]">
        <div className="flex flex-col items-center text-center">
          <Emblem size={84} halo priority />
          <p className="font-display text-silver-brushed mt-4 text-xl font-bold tracking-[0.08em]">Imperium</p>
          <p className="mt-0.5 text-[0.7rem] tracking-[0.12em] text-ice">Tec Refrigeração</p>
        </div>

        <section className="glass frost-edge mt-8 rounded-3xl p-6">
          <div className="flex items-start justify-between gap-3">
            <TypeIcon icon={item.type?.icon} size="lg" />
            <div className="flex flex-col items-end gap-1.5">
              <span className="rounded-md bg-abyss/50 px-2 py-0.5 font-mono text-xs tracking-wider text-frost ring-1 ring-rime">
                {code}
              </span>
              {removed ? (
                <ToneBadge tone="steel">Fora de operação</ToneBadge>
              ) : live ? (
                <ToneBadge tone="ice" live>
                  {live.status === "em_deslocamento" ? "Técnico a caminho" : "Em atendimento agora"}
                </ToneBadge>
              ) : item.status === "em_manutencao" ? (
                <ToneBadge tone="brass">Em manutenção</ToneBadge>
              ) : (
                <ToneBadge tone="mint">Em operação</ToneBadge>
              )}
            </div>
          </div>
          <h1 className="font-display text-silver-brushed mt-5 text-[1.7rem] font-semibold leading-tight">{typeName}</h1>
          <p className="mt-1 text-sm text-silver/85">
            {[[item.brand, item.model].filter(Boolean).join(" "), item.capacityBtu ? formatBTU(item.capacityBtu) : null]
              .filter(Boolean)
              .join(", ") || "Marca e modelo não informados"}
          </p>
          <div className="mt-4 space-y-1.5 text-sm">
            {place && (
              <p className="flex items-center gap-2 text-silver/90">
                <MapPin className="size-4 shrink-0 text-ice" />
                {place}
              </p>
            )}
            {customerLabel && (
              <p className="flex items-center gap-2 text-silver/90">
                <Building2 className="size-4 shrink-0 text-ice" />
                {customerLabel}
              </p>
            )}
          </div>
        </section>

        {removed ? (
          <p className="mt-5 rounded-2xl border border-rime bg-night/60 px-4 py-3 text-sm text-steel">
            Este aparelho foi retirado de operação. O histórico de manutenção continua guardado com a Imperium.
          </p>
        ) : (
          <div className="panel mt-5 grid grid-cols-2 overflow-hidden rounded-2xl">
            <div className="px-4 py-4">
              <p className="flex items-center gap-1.5 text-xs text-steel">
                <History className="size-3.5" />
                Última manutenção
              </p>
              {last?.finishedAt ? (
                <>
                  <p className="readout mt-1.5 text-lg font-semibold text-silver">{formatDate(last.finishedAt)}</p>
                  <p className="text-xs text-steel">
                    {firstName(last.technician?.name) ? `por ${firstName(last.technician?.name)}` : "Equipe Imperium"}
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-sm text-steel">Ainda sem registro</p>
              )}
            </div>
            <div className="border-l border-rime px-4 py-4">
              <p className="flex items-center gap-1.5 text-xs text-steel">
                <CalendarClock className="size-3.5" />
                Próxima prevista
              </p>
              {next ? (
                <>
                  <p
                    className={cn(
                      "readout mt-1.5 text-lg font-semibold",
                      next < today ? "text-brass" : "text-ice",
                    )}
                  >
                    {formatDate(next)}
                  </p>
                  <p className="text-xs text-steel first-letter:uppercase">
                    {next < today ? "Visita em atraso, já agendada" : formatLongDate(next).split(",")[0]}
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-sm text-steel">{link ? "A definir" : "Sem plano preventivo"}</p>
              )}
            </div>
          </div>
        )}

        {pmoc && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-mint/8 px-4 py-3 ring-1 ring-mint/25">
            <ShieldCheck className="size-5 shrink-0 text-mint" />
            <div>
              <p className="text-sm font-medium text-mint">PMOC vigente até {formatDate(pmoc.validUntil)}</p>
              <p className="text-xs text-steel">Plano de Manutenção, Operação e Controle (Lei 13.589/2018)</p>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-2.5">
          {ownerLink && (
            <Button asChild size="lg" className="h-12 w-full text-[0.95rem]">
              <Link href={ownerLink.href}>
                {ownerLink.label}
                <ArrowUpRight />
              </Link>
            </Button>
          )}
          {showCustomerActions && wa && (
            <Button asChild size="lg" className="h-12 w-full text-[0.95rem]">
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle />
                Solicitar atendimento
              </a>
            </Button>
          )}
          {showCustomerActions && !user && (
            <Button asChild variant="outline" size="lg" className="h-12 w-full text-[0.95rem]">
              <Link href={`/login?voltar=${encodeURIComponent(`/portal/equipamentos/${item.id}`)}`}>
                <LogIn />
                Sou cliente, entrar
              </Link>
            </Button>
          )}
          {ownerLink && wa && (
            <Button asChild variant="ghost" size="lg" className="h-11 w-full">
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle />
                Falar com a Imperium pelo WhatsApp
              </a>
            </Button>
          )}
        </div>

        {recent.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-silver-brushed text-lg font-semibold">Histórico recente</h2>
            <ol className="mt-3 space-y-0 border-l border-rime pl-5">
              {recent.map((w, i) => (
                <li key={w.id} className="relative pb-4 last:pb-0">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -left-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-abyss",
                      i === 0 ? "bg-mint" : "bg-steel/60",
                    )}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium tabular-nums text-silver">{formatDate(w.finishedAt)}</p>
                    <span className="flex items-center gap-1.5 text-xs text-steel">
                      <Wrench className="size-3" />
                      {labelOf(workOrderType, w.type).label}
                    </span>
                  </div>
                  {firstName(w.technician?.name) && (
                    <p className="text-xs text-steel">Técnico {firstName(w.technician?.name)}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <footer className="mt-10 border-t border-rime pt-5 text-center text-xs text-steel">
          <p className="text-silver/80">{settings.companyName}</p>
          {contact && <p className="mt-0.5 tabular-nums">WhatsApp {formatPhone(contact)}</p>}
          <p className="mt-2 text-steel/70">Etiqueta {code}</p>
        </footer>
      </div>
    </main>
  );
}
