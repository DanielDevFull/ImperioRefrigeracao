import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FileCheck2, MessageCircle, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { pmocDocuments } from "@/db/schema";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { requireCustomer } from "@/lib/auth/session";
import { diffDays, todayISO } from "@/lib/dates";
import { addressLine, formatDate } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { getSettings } from "@/server/settings";
import { contactLink, getEquipmentOverview } from "../_lib/data";

export const metadata: Metadata = { title: "PMOC" };

function validity(from: string, until: string, today: string): { label: string; tone: Tone } {
  if (from > today) return { label: `Vale a partir de ${formatDate(from)}`, tone: "frost" };
  if (until < today) return { label: `Vencido em ${formatDate(until)}`, tone: "red" };
  const left = diffDays(today, until);
  if (left <= 30) return { label: `Vence em ${left} dia${left === 1 ? "" : "s"}`, tone: "brass" };
  return { label: `Vigente até ${formatDate(until)}`, tone: "mint" };
}

export default async function PmocPage() {
  const { customer } = await requireCustomer();
  const [docs, settings, overview] = await Promise.all([
    db.query.pmocDocuments.findMany({
      where: eq(pmocDocuments.customerId, customer.id),
      with: { site: true },
      orderBy: [desc(pmocDocuments.validUntil)],
    }),
    getSettings(),
    getEquipmentOverview(customer.id),
  ]);
  const today = todayISO();
  const pmocPlan = overview.some((i) => i.plan?.isPmoc);
  const wa = contactLink(
    settings,
    docs.length ? "Olá! Tenho uma dúvida sobre o meu PMOC." : "Olá! Quero saber como fazer o PMOC do meu ambiente.",
  );

  return (
    <div>
      <PageHeader
        title="PMOC"
        description="Plano de Manutenção, Operação e Controle dos seus ambientes climatizados."
      />

      {docs.length > 0 ? (
        <div className="space-y-6">
          <Panel flush>
            <ul className="divide-y divide-rime">
              {docs.map((d) => {
                const v = validity(d.validFrom, d.validUntil, today);
                return (
                  <li key={d.id} className="flex flex-col gap-4 px-4 py-5 sm:px-5 md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 gap-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-mint/10 text-mint ring-1 ring-mint/25">
                        <FileCheck2 className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-silver">{d.site?.name ?? "PMOC"}</p>
                          <ToneBadge tone={v.tone}>{v.label}</ToneBadge>
                        </div>
                        {d.site && addressLine(d.site) && <p className="mt-0.5 truncate text-xs text-steel">{addressLine(d.site)}</p>}
                        <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
                          <div>
                            <dt className="text-steel">Responsável técnico</dt>
                            <dd className="mt-0.5 text-silver">
                              {d.responsibleName}
                              {d.responsibleRegistry && <span className="block text-steel">{d.responsibleRegistry}</span>}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-steel">ART</dt>
                            <dd className="readout mt-0.5 text-silver">{d.artNumber ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-steel">Vigência</dt>
                            <dd className="readout mt-0.5 text-silver">
                              {formatDate(d.validFrom)} a {formatDate(d.validUntil)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                    <Button asChild size="lg" className="h-10 shrink-0 px-4">
                      <Link href={`/pmoc/${d.id}/imprimir`}>Abrir PMOC</Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <p className="max-w-2xl text-xs leading-relaxed text-steel">
            Guarde o PMOC disponível no local para a fiscalização da vigilância sanitária. As visitas do plano mantêm os
            registros de manutenção em dia; o relatório de cada visita fica em Atendimentos.
          </p>
        </div>
      ) : (
        <section className="panel relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_100%_0%,var(--haze-mint),transparent_70%)]" />
          <div className="relative grid gap-8 p-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:p-8">
            <div>
              <span className="grid size-12 place-items-center rounded-2xl bg-mint/10 text-mint ring-1 ring-mint/25">
                <ShieldCheck className="size-6" />
              </span>
              <h2 className="font-display text-silver-brushed mt-5 text-2xl font-semibold tracking-[0.02em]">
                {pmocPlan ? "Seu PMOC está sendo preparado" : "O que é o PMOC"}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-steel">
                O PMOC é o plano que registra a manutenção, a operação e o controle dos aparelhos de ar-condicionado. A{" "}
                <span className="text-silver">Lei 13.589/2018</span> torna o plano obrigatório para edifícios de uso público e
                coletivo com ambientes climatizados, como escritórios, clínicas, lojas, academias e escolas.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-steel">
                {pmocPlan
                  ? "Seu plano já inclui a rotina do PMOC. Assim que o documento for emitido e assinado pelo responsável técnico, ele aparece aqui para abrir e imprimir."
                  : "Para residências ele não é exigido. Se você tem um ambiente comercial, a Imperium elabora o PMOC com responsável técnico e ART e cuida das visitas e registros."}
              </p>
              {wa && (
                <Button asChild size="lg" className="mt-6 h-11 px-5">
                  <a href={wa} target="_blank" rel="noreferrer">
                    <MessageCircle /> {pmocPlan ? "Falar sobre o meu PMOC" : "Quero um PMOC"}
                  </a>
                </Button>
              )}
            </div>
            <ul className="space-y-4 self-center text-sm">
              {[
                ["Responsável técnico", "Engenheiro ou técnico habilitado assina o plano e emite a ART."],
                ["Rotinas por aparelho", "Limpeza de filtros, bandejas e serpentinas com a frequência certa."],
                ["Registros guardados", "Cada visita gera relatório com data, técnico e medições."],
                ["Pronto para fiscalização", "Documento disponível no local para a vigilância sanitária."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-mint" />
                  <span>
                    <span className="block font-medium text-silver">{t}</span>
                    <span className="text-steel">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
