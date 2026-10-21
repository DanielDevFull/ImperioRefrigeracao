import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin, Plus } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { requireCustomer } from "@/lib/auth/session";
import { addressLine, formatBTU, formatDate } from "@/lib/format";
import { getSettings } from "@/server/settings";
import { EquipmentTile, HealthMeter } from "../_components/bits";
import { contactLink, getEquipmentOverview, type EquipmentOverview } from "../_lib/data";

export const metadata: Metadata = { title: "Equipamentos" };

export default async function EquipamentosPage() {
  const { customer } = await requireCustomer();
  const [items, settings] = await Promise.all([getEquipmentOverview(customer.id), getSettings()]);

  const groups = new Map<string, { name: string; address: string; items: EquipmentOverview[] }>();
  for (const it of items) {
    const key = it.equipment.site?.id ?? "sem-local";
    if (!groups.has(key)) {
      groups.set(key, {
        name: it.equipment.site?.name ?? "Sem endereço definido",
        address: it.equipment.site ? addressLine(it.equipment.site) : "",
        items: [],
      });
    }
    groups.get(key)!.items.push(it);
  }
  const covered = items.filter((i) => i.plan).length;
  const wa = contactLink(settings, "Olá! Quero incluir um equipamento no meu cadastro.");

  return (
    <div>
      <PageHeader
        title="Meus equipamentos"
        description={
          items.length
            ? `${items.length} equipamento${items.length === 1 ? "" : "s"}, ${covered} no plano de manutenção.`
            : "Os aparelhos cadastrados pela Imperium aparecem aqui."
        }
        actions={
          items.length > 0 && (
            <Button asChild size="lg" className="h-10 px-4">
              <Link href="/portal/atendimentos/novo">
                <Plus /> Solicitar atendimento
              </Link>
            </Button>
          )
        }
      />

      {items.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nenhum equipamento cadastrado"
            description="Peça para a Imperium cadastrar seus aparelhos. Assim você acompanha manutenções, histórico e etiqueta QR de cada um."
            action={
              wa ? (
                <Button asChild size="lg">
                  <a href={wa} target="_blank" rel="noreferrer">
                    Falar com a Imperium
                  </a>
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <div className="space-y-8">
          {[...groups.values()].map((g) => (
            <section key={g.name}>
              {groups.size > 1 || g.address ? (
                <div className="mb-3 flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-ice" />
                  <div className="min-w-0">
                    <h2 className="text-[0.95rem] font-semibold text-silver">{g.name}</h2>
                    {g.address && <p className="truncate text-xs text-steel">{g.address}</p>}
                  </div>
                </div>
              ) : null}
              <Panel flush>
                <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_1rem] gap-4 border-b border-rime px-5 py-2.5 text-xs text-steel lg:grid">
                  <span>Equipamento</span>
                  <span>Especificação</span>
                  <span>Plano</span>
                  <span>Próxima manutenção</span>
                  <span>Último serviço</span>
                  <span />
                </div>
                <ul className="divide-y divide-rime">
                  {g.items.map((it) => (
                    <EquipmentRow key={it.equipment.id} item={it} />
                  ))}
                </ul>
              </Panel>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EquipmentRow({ item }: { item: EquipmentOverview }) {
  const e = item.equipment;
  const name = [e.brand, e.model].filter(Boolean).join(" ") || e.type?.name || "Equipamento";
  const next = item.nextVisit;
  return (
    <li>
      <Link
        href={`/portal/equipamentos/${e.id}`}
        className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-ice/5 sm:px-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_1rem] lg:items-center"
      >
        <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
          <EquipmentTile icon={e.type?.icon} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-silver">{name}</p>
            <p className="truncate text-xs text-steel">{e.location ?? "Ambiente não informado"}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-steel/60 lg:hidden" />
        </div>

        <div className="min-w-0 text-xs">
          <p className="text-steel lg:hidden">Especificação</p>
          <p className="truncate text-silver">{e.type?.name ?? "Tipo não informado"}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-steel">
            <span className="readout">{formatBTU(e.capacityBtu)}</span>
            {e.refrigerant && <span className="readout text-frost/80">{e.refrigerant}</span>}
          </p>
        </div>

        <div className="min-w-0 text-xs">
          <p className="text-steel lg:hidden">Plano</p>
          {item.plan ? (
            <p className="truncate text-silver" title={item.plan.contractName}>
              {item.plan.planName}
            </p>
          ) : (
            <p className="text-steel">Fora do plano</p>
          )}
          <HealthMeter health={item.health} className="mt-1" />
        </div>

        <div className="min-w-0 text-xs">
          <p className="text-steel lg:hidden">Próxima manutenção</p>
          {next ? (
            <>
              <p className="readout text-sm text-silver">{formatDate(next.date)}</p>
              <p className="mt-0.5">
                {next.source === "om" ? (
                  <ToneBadge tone="violet" className="px-2 py-0 text-[0.68rem]">
                    Agendada
                  </ToneBadge>
                ) : (
                  <span className="text-steel">Prevista pelo plano</span>
                )}
              </p>
            </>
          ) : (
            <p className="text-steel">Sem previsão</p>
          )}
        </div>

        <div className="min-w-0 text-xs">
          <p className="text-steel lg:hidden">Último serviço</p>
          <p className="readout text-sm text-silver">{item.lastService?.date ? formatDate(item.lastService.date) : "—"}</p>
        </div>

        <ChevronRight className="hidden size-4 text-steel/60 lg:block" />
      </Link>
    </li>
  );
}
