import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ToneBadge } from "@/components/system/tone-badge";
import { requireStaff } from "@/lib/auth/session";
import { formatDateTime, formatRelative } from "@/lib/format";
import { getSettings } from "@/server/settings";
import { RunNowButton } from "./_components/run-now-button";
import { SectionNav } from "./_components/section-nav";
import {
  AutomationForm,
  BillingForm,
  CommissionForm,
  CompanyForm,
  PixForm,
  PmocResponsibleForm,
} from "./_components/settings-forms";

export const metadata: Metadata = { title: "Configurações" };

const SECTIONS = [
  { id: "empresa", label: "Empresa" },
  { id: "pix", label: "Recebimento por Pix" },
  { id: "cobranca", label: "Cobrança" },
  { id: "automacao", label: "Geração automática de OMs" },
  { id: "comissoes", label: "Comissões" },
  { id: "pmoc", label: "Responsável técnico do PMOC" },
  { id: "rotina", label: "Rotina automática" },
];

type RunSummary = {
  mensalidades?: number;
  oms?: number;
  equipamentosVerificados?: number;
  bloqueadosPorInadimplencia?: number;
  omsSemTecnico?: number;
  solicitacoesCompra?: number;
  erros?: { contractEquipmentId?: string; message?: string }[];
};

function parseSummary(raw: string | null): { data: RunSummary | null; text: string | null } {
  if (!raw) return { data: null, text: null };
  try {
    const data = JSON.parse(raw) as RunSummary;
    return typeof data === "object" && data ? { data, text: null } : { data: null, text: raw };
  } catch {
    return { data: null, text: raw };
  }
}

function originLabel(triggeredBy: string | null) {
  if (!triggeredBy) return "—";
  if (triggeredBy === "cron") return "Automática (6h)";
  if (triggeredBy === "seed") return "Carga inicial";
  if (triggeredBy.startsWith("manual:")) return `Manual, por ${triggeredBy.slice(7)}`;
  return triggeredBy;
}

function duration(start: Date, end: Date | null) {
  if (!end) return null;
  const ms = end.getTime() - start.getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
}

export default async function SettingsPage() {
  await requireStaff();
  const [s, runs] = await Promise.all([
    getSettings(),
    db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(10),
  ]);

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Dados da empresa, recebimento e as regras que o sistema segue sozinho todos os dias. Cada seção é salva separadamente."
      />

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
        <SectionNav sections={SECTIONS} />

        <div className="min-w-0 space-y-6">
          <section id="empresa" className="scroll-mt-24">
            <Panel title="Empresa" description="Identificação usada nos documentos e no contato com os clientes." flush>
              <CompanyForm
                initial={{
                  companyName: s.companyName,
                  document: s.document,
                  phone: s.phone,
                  whatsapp: s.whatsapp,
                  email: s.email,
                  address: s.address,
                  city: s.city,
                  state: s.state,
                }}
              />
            </Panel>
          </section>

          <section id="pix" className="scroll-mt-24">
            <Panel title="Recebimento por Pix" description="Chave usada no QR Code e no Pix copia e cola das mensalidades." flush>
              <PixForm initial={{ pixKey: s.pixKey, pixMerchantName: s.pixMerchantName, pixMerchantCity: s.pixMerchantCity }} />
            </Panel>
          </section>

          <section id="cobranca" className="scroll-mt-24">
            <Panel title="Cobrança" description="Encargos de atraso e prazos das mensalidades e dos serviços avulsos." flush>
              <BillingForm
                initial={{
                  lateFinePercent: s.lateFinePercent,
                  lateInterestMonthlyPercent: s.lateInterestMonthlyPercent,
                  invoiceLeadDays: s.invoiceLeadDays,
                  serviceDueDays: s.serviceDueDays,
                }}
              />
            </Panel>
          </section>

          <section id="automacao" className="scroll-mt-24">
            <Panel title="Geração automática de OMs" description="Como a rotina diária transforma os planos de manutenção em OMs na agenda." flush>
              <AutomationForm
                initial={{
                  workOrderHorizonDays: s.workOrderHorizonDays,
                  worksSaturday: s.worksSaturday,
                  blockOverdueDays: s.blockOverdueDays,
                }}
              />
            </Panel>
          </section>

          <section id="comissoes" className="scroll-mt-24">
            <Panel title="Comissões" description="Quando a comissão do técnico fica disponível para pagamento." flush>
              <CommissionForm initial={{ commissionTrigger: s.commissionTrigger }} />
            </Panel>
          </section>

          <section id="pmoc" className="scroll-mt-24">
            <Panel
              title="Responsável técnico do PMOC"
              description="Engenheiro ou técnico habilitado que assina os planos (Lei 13.589/2018)."
              flush
            >
              <PmocResponsibleForm
                initial={{
                  pmocResponsibleName: s.pmocResponsibleName,
                  pmocResponsibleRegistry: s.pmocResponsibleRegistry,
                  pmocResponsibleArt: s.pmocResponsibleArt,
                }}
              />
            </Panel>
          </section>

          <section id="rotina" className="scroll-mt-24">
            <Panel
              title="Rotina automática"
              description={
                s.lastDailyRunAt
                  ? `Roda todos os dias às 6h: gera mensalidades, OMs preventivas e pedidos de reposição. Última execução ${formatRelative(s.lastDailyRunAt)}.`
                  : "Roda todos os dias às 6h: gera mensalidades, OMs preventivas e pedidos de reposição."
              }
              actions={<RunNowButton />}
              flush
            >
              {runs.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-steel">
                  A rotina ainda não rodou. Use Rodar agora para gerar as primeiras OMs e mensalidades.
                </p>
              ) : (
                <ol className="divide-y divide-rime">
                  {runs.map((r) => {
                    const { data, text } = parseSummary(r.summary);
                    const running = !r.finishedAt;
                    const errors = data?.erros ?? [];
                    return (
                      <li key={r.id} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[11rem_1fr_auto] sm:items-start sm:gap-6">
                        <div>
                          <p className="readout text-sm text-silver">{formatDateTime(r.startedAt)}</p>
                          <p className="text-xs text-steel">
                            {originLabel(r.triggeredBy)}
                            {duration(r.startedAt, r.finishedAt) && <span className="readout"> em {duration(r.startedAt, r.finishedAt)}</span>}
                          </p>
                        </div>
                        <div className="min-w-0 text-sm text-steel">
                          {data ? (
                            <>
                              <p>
                                <span className="text-silver">{plural(data.mensalidades ?? 0, "mensalidade", "mensalidades")}</span>,{" "}
                                <span className="text-silver">{plural(data.oms ?? 0, "OM", "OMs")}</span> e{" "}
                                <span className="text-silver">
                                  {plural(data.solicitacoesCompra ?? 0, "solicitação de compra", "solicitações de compra")}
                                </span>
                              </p>
                              {((data.bloqueadosPorInadimplencia ?? 0) > 0 || (data.omsSemTecnico ?? 0) > 0) && (
                                <p className="mt-0.5 text-xs">
                                  {(data.omsSemTecnico ?? 0) > 0 && <>{plural(data.omsSemTecnico ?? 0, "OM ficou", "OMs ficaram")} sem técnico. </>}
                                  {(data.bloqueadosPorInadimplencia ?? 0) > 0 && (
                                    <>{plural(data.bloqueadosPorInadimplencia ?? 0, "equipamento ficou", "equipamentos ficaram")} sem OM por inadimplência.</>
                                  )}
                                </p>
                              )}
                              {errors.length > 0 && (
                                <details className="mt-1 text-xs">
                                  <summary className="cursor-pointer text-gauge-red">{plural(errors.length, "erro", "erros")} ao gerar OMs</summary>
                                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-steel">
                                    {errors.slice(0, 8).map((e, i) => (
                                      <li key={i}>{e.message ?? "Erro sem descrição"}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </>
                          ) : running ? (
                            <p>Em andamento…</p>
                          ) : (
                            <p className="text-gauge-red">{text ?? "Sem resumo"}</p>
                          )}
                        </div>
                        <div className="sm:text-right">
                          {running ? (
                            <ToneBadge tone="ice" live>
                              Rodando
                            </ToneBadge>
                          ) : r.ok ? (
                            <ToneBadge tone="mint">Concluída</ToneBadge>
                          ) : (
                            <ToneBadge tone="red">Com falha</ToneBadge>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>
          </section>
        </div>
      </div>
    </>
  );
}
