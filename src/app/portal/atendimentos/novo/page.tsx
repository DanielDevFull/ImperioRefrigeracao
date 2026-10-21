import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { BellRing, CalendarCheck, ClipboardCheck, MessageCircle } from "lucide-react";
import { db } from "@/db";
import { customerSites, equipment, workOrders } from "@/db/schema";
import { PageHeader } from "@/components/system/page-header";
import { Button } from "@/components/ui/button";
import { requireCustomer } from "@/lib/auth/session";
import { addressLine, formatOM } from "@/lib/format";
import { param } from "@/lib/params";
import { getSettings } from "@/server/settings";
import { isUuid } from "../../_lib/copy";
import { contactLink } from "../../_lib/data";
import { RequestForm, type EquipOption, type SiteOption } from "./request-form";
import { SuccessMark } from "./success-mark";

export const metadata: Metadata = { title: "Solicitar atendimento" };

export default async function NovoAtendimentoPage({ searchParams }: PageProps<"/portal/atendimentos/novo">) {
  const { customer } = await requireCustomer();
  const sp = await searchParams;
  const criado = param(sp, "criado");

  if (isUuid(criado)) {
    const wo = await db.query.workOrders.findFirst({
      where: and(eq(workOrders.id, criado), eq(workOrders.customerId, customer.id)),
      columns: { id: true, number: true, title: true, priority: true },
    });
    if (wo) {
      const settings = await getSettings();
      const wa = contactLink(settings, `Olá! Abri o chamado ${formatOM(wo.number)} pelo portal.`);
      return <Success wo={wo} whatsapp={wa} />;
    }
  }

  const [eqRows, siteRows] = await Promise.all([
    db.query.equipment.findMany({
      where: and(eq(equipment.customerId, customer.id), ne(equipment.status, "removido")),
      with: { type: { columns: { name: true, icon: true } } },
      orderBy: [asc(equipment.code)],
    }),
    db.query.customerSites.findMany({
      where: eq(customerSites.customerId, customer.id),
      orderBy: [asc(customerSites.name)],
    }),
  ]);

  const options: EquipOption[] = eqRows.map((e) => ({
    id: e.id,
    name: [e.brand, e.model].filter(Boolean).join(" ") || e.type?.name || "Equipamento",
    location: e.location,
    typeName: e.type?.name ?? null,
    icon: e.type?.icon ?? null,
    siteId: e.siteId,
  }));
  const sites: SiteOption[] = siteRows.map((s) => ({ id: s.id, name: s.name, address: addressLine(s) }));
  const wanted = param(sp, "equipmentId");
  const initial = wanted && options.some((o) => o.id === wanted) ? wanted : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Solicitar atendimento"
        description="Conte o que está acontecendo. A equipe da Imperium analisa, define o técnico e agenda a visita com você."
        back={{ href: initial ? `/portal/equipamentos/${initial}` : "/portal/atendimentos", label: initial ? "Equipamento" : "Atendimentos" }}
      />
      <RequestForm equipment={options} sites={sites} initialEquipmentId={initial} />
    </div>
  );
}

function Success({
  wo,
  whatsapp,
}: {
  wo: { id: string; number: number; title: string; priority: string };
  whatsapp: string | null;
}) {
  const steps = [
    { icon: ClipboardCheck, title: "Análise do chamado", text: "A equipe lê o seu relato e escolhe o técnico certo para o problema." },
    { icon: CalendarCheck, title: "Data da visita", text: "A data e o horário aparecem aqui no portal assim que forem marcados." },
    { icon: BellRing, title: "Aviso no dia", text: "Você recebe um aviso quando o técnico estiver a caminho." },
  ];
  return (
    <div className="mx-auto max-w-xl pt-4 text-center md:pt-10">
      <SuccessMark />
      <p className="mt-6 text-sm text-steel">Chamado aberto</p>
      <h1 className="font-display text-silver-brushed mt-1 text-3xl font-semibold tracking-[0.03em] md:text-4xl">
        {formatOM(wo.number)}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-steel">{wo.title}</p>
      {wo.priority === "urgente" && (
        <p className="mx-auto mt-3 max-w-md rounded-xl border border-gauge-red/30 bg-gauge-red/8 px-4 py-2.5 text-sm text-silver">
          Marcado como urgente. Se o equipamento estiver em um local crítico, chame também no WhatsApp.
        </p>
      )}

      <ol className="panel mt-8 divide-y divide-rime text-left">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 px-5 py-4">
            <span className="readout grid size-8 shrink-0 place-items-center rounded-full bg-ice/12 text-xs font-semibold text-ice ring-1 ring-ice/25">
              {i + 1}
            </span>
            <span>
              <span className="flex items-center gap-2 text-sm font-medium text-silver">
                <s.icon className="size-4 text-frost" aria-hidden />
                {s.title}
              </span>
              <span className="mt-0.5 block text-sm text-steel">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button asChild size="lg" className="h-11 px-5">
          <Link href={`/portal/atendimentos/${wo.id}`}>Acompanhar atendimento</Link>
        </Button>
        {whatsapp && (
          <Button asChild variant="outline" size="lg" className="h-11 px-5">
            <a href={whatsapp} target="_blank" rel="noreferrer">
              <MessageCircle /> Falar no WhatsApp
            </a>
          </Button>
        )}
        <Button asChild variant="ghost" size="lg" className="h-11 px-5">
          <Link href="/portal">Voltar ao início</Link>
        </Button>
      </div>
    </div>
  );
}
