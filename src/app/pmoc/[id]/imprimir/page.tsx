import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { pmocDocuments } from "@/db/schema";
import { Emblem } from "@/components/brand/emblem";
import { getCurrentUser, STAFF_ROLES } from "@/lib/auth/session";
import { addMonths, monthDiff, todayISO } from "@/lib/dates";
import {
  addressLine,
  formatCEP,
  formatDate,
  formatDateTime,
  formatDocument,
  formatEquipmentCode,
  formatNumber,
  formatOM,
  formatPhone,
} from "@/lib/format";
import { frequencyMonths, workOrderType } from "@/lib/labels";
import { getSettings } from "@/server/settings";
import { coveredEquipment, frequencyLetter, plansOf, pmocCompliance, shortMonth } from "@/app/admin/pmoc/_lib/pmoc";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "PMOC para impressão", robots: { index: false } };

const UUID = /^[0-9a-f-]{36}$/i;

const CSS = `
.pmoc-paper { --ink:#0b1730; --ink-2:#4b5b75; --line:#d5dce8; --tint:#f2f5fa; --accent:#1677d6; --ok:#0f8a64; --bad:#c23548;
  color: var(--ink); font-size: 10.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pmoc-paper h2 { font-size: 11.5pt; font-weight: 600; display: flex; align-items: baseline; gap: 8px;
  padding-bottom: 5px; border-bottom: 1.5px solid var(--ink); margin: 0 0 10px; break-after: avoid; }
.pmoc-paper h2 .n { font-family: var(--font-cinzel), Georgia, serif; font-weight: 700; color: var(--accent); min-width: 1.1em; }
.pmoc-paper h3 { font-size: 10.5pt; font-weight: 600; margin: 12px 0 6px; break-after: avoid; }
.pmoc-paper section { margin-top: 22px; }
.pmoc-paper .muted { color: var(--ink-2); }
.pmoc-paper .num { font-variant-numeric: tabular-nums; }
.pmoc-paper dl.grid-kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
.pmoc-paper dl.grid-kv > div { padding: 6px 10px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); min-width: 0; }
.pmoc-paper dl.grid-kv > div.wide { grid-column: 1 / -1; }
.pmoc-paper dl.grid-kv dt { font-size: 8pt; color: var(--ink-2); }
.pmoc-paper dl.grid-kv dd { font-weight: 500; overflow-wrap: anywhere; }
.pmoc-paper .tbl-wrap { overflow-x: auto; }
.pmoc-paper table { width: 100%; border-collapse: collapse; font-size: 9pt; }
.pmoc-paper thead { display: table-header-group; }
.pmoc-paper th { text-align: left; font-weight: 600; background: var(--tint); color: var(--ink); padding: 5px 6px; border-bottom: 1px solid var(--ink-2); }
.pmoc-paper td { padding: 5px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
.pmoc-paper tr { break-inside: avoid; }
.pmoc-paper td.r, .pmoc-paper th.r { text-align: right; font-variant-numeric: tabular-nums; }
.pmoc-paper tfoot td { font-weight: 600; border-bottom: 0; border-top: 1px solid var(--ink-2); }
.pmoc-paper .sched th, .pmoc-paper .sched td { text-align: center; padding: 4px 1px; font-size: 8pt; }
.pmoc-paper .sched th:first-child, .pmoc-paper .sched td:first-child { text-align: left; padding-left: 6px; width: 30%; }
.pmoc-paper .sched td { border: 1px solid var(--line); }
.pmoc-paper .sched td.ok { background: #e2f5ee; color: var(--ok); font-weight: 600; }
.pmoc-paper .sched td.miss { background: #fbe6e9; color: var(--bad); font-weight: 600; }
.pmoc-paper .sched td.plan { color: var(--ink); font-weight: 600; }
.pmoc-paper ul.rec { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.pmoc-paper ul.rec li { padding-left: 16px; position: relative; }
.pmoc-paper ul.rec li::before { content: ""; position: absolute; left: 3px; top: 0.6em; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
.pmoc-paper .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 54px; }
.pmoc-paper .sign div { border-top: 1px solid var(--ink); padding-top: 6px; font-size: 9pt; text-align: center; }
.pmoc-paper .keep { break-inside: avoid; }
@page { size: A4; margin: 14mm 12mm 14mm; }
@media print {
  :root { color-scheme: light !important; }
  html, body { background: #fff !important; }
  .pmoc-screen { padding: 0 !important; background: #fff !important; min-height: 0 !important; }
  .pmoc-paper { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; width: auto !important; }
  .pmoc-paper .tbl-wrap { overflow: visible; }
}
@media screen and (max-width: 640px) {
  .pmoc-paper table { min-width: 600px; }
  .pmoc-paper table.sched { min-width: 720px; }
  .pmoc-paper dl.grid-kv { grid-template-columns: 1fr; }
  .pmoc-paper .sign { grid-template-columns: 1fr; gap: 44px; }
}
`;

const RE9 = [
  ["Dióxido de carbono (CO₂)", "≤ 1.000 ppm", "Indicador de renovação do ar externo"],
  ["Aerodispersóides totais", "≤ 80 µg/m³", "Grau de pureza do ar e limpeza do ambiente"],
  ["Fungos (contaminação microbiológica)", "≤ 750 ufc/m³", "Relação interno/externo (I/E) ≤ 1,5"],
  ["Temperatura de operação", "23 a 26 °C (verão), 20 a 22 °C (inverno)", "Conforto térmico"],
  ["Umidade relativa do ar", "40 a 65% (verão), 35 a 65% (inverno)", "Conforto e controle microbiológico"],
  ["Velocidade do ar", "≤ 0,25 m/s", "Medida a 1,5 m do piso, na zona ocupada"],
  ["Renovação de ar", "≥ 27 m³/h por pessoa", "17 m³/h por pessoa em ambientes de alta rotatividade"],
];

const tr = (btu: number) => formatNumber(Math.round((btu / 12000) * 100) / 100);

export default async function PrintPmocPage({ params }: PageProps<"/pmoc/[id]/imprimir">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?voltar=${encodeURIComponent(`/pmoc/${id}/imprimir`)}`);
  if (!UUID.test(id)) notFound();

  const doc = await db.query.pmocDocuments.findFirst({
    where: eq(pmocDocuments.id, id),
    with: { customer: { with: { sites: true } }, site: true },
  });
  if (!doc) notFound();
  const isStaff = STAFF_ROLES.includes(user.role);
  const isOwner = user.role === "cliente" && !!doc.customer.userId && doc.customer.userId === user.id;
  if (!isStaff && !isOwner) notFound();

  const today = todayISO();
  const [settings, { covered }] = await Promise.all([getSettings(), coveredEquipment(doc)]);
  const comp = await pmocCompliance(doc, covered, today);
  const plans = plansOf(covered);
  const customer = doc.customer;
  const primarySite = customer.sites.find((s) => s.isPrimary) ?? customer.sites[0] ?? null;
  const site = doc.site;
  const totalBtu = covered.reduce((n, c) => n + (c.equipment.capacityBtu ?? 0), 0);
  const area = site ? site.areaM2 : customer.sites.reduce((n, s) => n + (s.areaM2 ?? 0), 0) || null;
  const occupants = site ? site.occupants : customer.sites.reduce((n, s) => n + (s.occupants ?? 0), 0) || null;

  // Cronograma: meses da vigência (até 15 colunas)
  const monthCount = Math.min(15, monthDiff(doc.validFrom, doc.validUntil) + 1);
  const months = Array.from({ length: monthCount }, (_, i) => addMonths(`${doc.validFrom.slice(0, 7)}-01`, i).slice(0, 7));
  const usedLetters = new Set(comp.visits.map((v) => v.letter));
  const LETTERS = [
    [1, "M"],
    [2, "B"],
    [3, "T"],
    [4, "Q"],
    [6, "S"],
    [12, "A"],
  ] as const;

  const eqById = new Map(covered.map((c) => [c.equipment.id, c]));
  const contact = [
    settings.phone && `telefone ${formatPhone(settings.phone)}`,
    settings.whatsapp && `WhatsApp ${formatPhone(settings.whatsapp)}`,
    settings.email && `e-mail ${settings.email}`,
  ].filter(Boolean) as string[];
  const companyAddress = [settings.address, [settings.city, settings.state].filter(Boolean).join("/")].filter(Boolean).join(", ");
  const backHref = isStaff ? `/admin/pmoc/${doc.id}` : "/portal/pmoc";

  return (
    <div className="pmoc-screen min-h-dvh px-3 py-6 sm:px-6 sm:py-10">
      <style>{CSS}</style>

      <div className="no-print mx-auto mb-6 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-steel transition-colors hover:text-frost">
          <ChevronLeft className="size-4" />
          {isStaff ? "Voltar ao PMOC" : "Voltar ao portal"}
        </Link>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-steel sm:block">Para salvar em PDF, escolha “Salvar como PDF” na janela de impressão.</p>
          <PrintButton />
        </div>
      </div>

      <article className="pmoc-paper mx-auto w-full max-w-[210mm] rounded-sm bg-white px-5 py-8 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)] sm:px-[14mm] sm:py-[16mm]">
        {/* Cabeçalho */}
        <header className="keep flex flex-col gap-5 border-b-2 border-[var(--ink)] pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Emblem size={52} />
            <div className="min-w-0">
              <p className="font-semibold">{settings.companyName}</p>
              <p className="muted text-[8.5pt] leading-snug">
                {settings.document && <>CNPJ {formatDocument(settings.document)}<br /></>}
                {companyAddress && <>{companyAddress}<br /></>}
                {contact.join(", ")}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className="muted text-[8.5pt]">Vigência</p>
            <p className="num whitespace-nowrap font-semibold">
              {formatDate(doc.validFrom)} a {formatDate(doc.validUntil)}
            </p>
            {doc.artNumber && (
              <p className="num muted text-[8.5pt]">ART nº {doc.artNumber}</p>
            )}
          </div>
        </header>

        <div className="keep pt-7 text-center">
          <h1 className="font-display text-[19pt] font-bold leading-tight tracking-[0.03em] sm:text-[22pt]">
            Plano de Manutenção, Operação e Controle
          </h1>
          <p className="mt-1 font-display text-[12pt] font-semibold tracking-[0.2em] text-[var(--accent)]">PMOC</p>
          <p className="muted mx-auto mt-3 max-w-[150mm] text-[9pt]">
            Elaborado conforme a Lei nº 13.589/2018, a Portaria MS nº 3.523/1998 (Anexo I), a Resolução ANVISA RE nº 9/2003 e a
            norma ABNT NBR 13971, para {site ? `o local ${site.name} de ` : ""}
            {customer.tradeName ?? customer.name}.
          </p>
        </div>

        {/* 1 */}
        <section>
          <h2>
            <span className="n">1</span>Identificação do ambiente ou conjunto de ambientes
          </h2>
          <dl className="grid-kv">
            <div className="wide">
              <dt>Nome do edifício ou local</dt>
              <dd>{site ? `${customer.tradeName ?? customer.name}, ${site.name}` : `${customer.tradeName ?? customer.name} (todos os locais)`}</dd>
            </div>
            <div className="wide">
              <dt>Endereço completo</dt>
              <dd>
                {site
                  ? `${addressLine(site) || "Não informado"}${site.zip ? `, CEP ${formatCEP(site.zip)}` : ""}`
                  : customer.sites.map((s) => `${s.name}: ${addressLine(s) || "endereço não informado"}`).join("; ") || "Não informado"}
              </dd>
            </div>
            <div>
              <dt>Área climatizada total</dt>
              <dd className="num">{area ? `${formatNumber(area)} m²` : "Não informada"}</dd>
            </div>
            <div>
              <dt>Número de ocupantes</dt>
              <dd className="num">{occupants ? `${formatNumber(occupants)} pessoas` : "Não informado"}</dd>
            </div>
            <div>
              <dt>Equipamentos de climatização no plano</dt>
              <dd className="num">{covered.length}</dd>
            </div>
            <div>
              <dt>Carga térmica instalada</dt>
              <dd className="num">{totalBtu ? `${formatNumber(totalBtu)} BTU/h (${tr(totalBtu)} TR)` : "Não informada"}</dd>
            </div>
            {doc.notes && (
              <div className="wide">
                <dt>Observações</dt>
                <dd className="whitespace-pre-line font-normal">{doc.notes}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* 2 */}
        <section>
          <h2>
            <span className="n">2</span>Identificação do proprietário, locatário ou preposto
          </h2>
          <dl className="grid-kv">
            <div className="wide">
              <dt>{customer.personType === "pj" ? "Razão social" : "Nome"}</dt>
              <dd>
                {customer.name}
                {customer.tradeName ? <span className="muted font-normal"> ({customer.tradeName})</span> : null}
              </dd>
            </div>
            <div>
              <dt>{customer.personType === "pj" ? "CNPJ" : "CPF"}</dt>
              <dd className="num">{customer.document ? formatDocument(customer.document) : "Não informado"}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd className="num">{customer.phone || customer.whatsapp ? formatPhone(customer.phone ?? customer.whatsapp) : "Não informado"}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{customer.email ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Endereço</dt>
              <dd>{primarySite ? addressLine(primarySite) || "Não informado" : "Não informado"}</dd>
            </div>
          </dl>
        </section>

        {/* 3 */}
        <section>
          <h2>
            <span className="n">3</span>Identificação do responsável técnico
          </h2>
          <dl className="grid-kv">
            <div className="wide">
              <dt>Nome</dt>
              <dd>{doc.responsibleName}</dd>
            </div>
            <div>
              <dt>Registro no conselho de classe (CREA/CFT)</dt>
              <dd className="num">{doc.responsibleRegistry ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Anotação de Responsabilidade Técnica (ART)</dt>
              <dd className="num">{doc.artNumber ?? "Não informada"}</dd>
            </div>
            <div className="wide">
              <dt>Empresa responsável pela execução</dt>
              <dd>
                {settings.companyName}
                {settings.document ? <span className="num font-normal">, CNPJ {formatDocument(settings.document)}</span> : null}
              </dd>
            </div>
          </dl>
        </section>

        {/* 4 */}
        <section>
          <h2>
            <span className="n">4</span>Relação dos ambientes climatizados e equipamentos
          </h2>
          {covered.length === 0 ? (
            <p className="muted">Nenhum equipamento deste local está em plano de manutenção PMOC.</p>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Ambiente</th>
                    <th>Tipo</th>
                    <th>Marca e modelo</th>
                    <th>Nº de série</th>
                    <th className="r">BTU/h</th>
                    <th className="r">TR</th>
                    <th>Fluido</th>
                  </tr>
                </thead>
                <tbody>
                  {covered.map(({ equipment: e }, i) => (
                    <tr key={e.id}>
                      <td className="num">{String(i + 1).padStart(2, "0")}</td>
                      <td>
                        {e.location ?? "Não informado"}
                        {!site && e.site ? <span className="muted"> ({e.site.name})</span> : null}
                        <div className="muted num text-[7.5pt]">{formatEquipmentCode(e.code)}</div>
                      </td>
                      <td>{e.type?.name ?? "Não informado"}</td>
                      <td>{[e.brand, e.model].filter(Boolean).join(" ") || "Não informado"}</td>
                      <td className="num">{e.serialNumber ?? "—"}</td>
                      <td className="r">{e.capacityBtu ? formatNumber(e.capacityBtu) : "—"}</td>
                      <td className="r">{e.capacityBtu ? tr(e.capacityBtu) : "—"}</td>
                      <td>{e.refrigerant ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
                {totalBtu > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={5}>Total instalado</td>
                      <td className="r">{formatNumber(totalBtu)}</td>
                      <td className="r">{tr(totalBtu)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>

        {/* 5 */}
        <section>
          <h2>
            <span className="n">5</span>Plano de manutenção e controle
          </h2>
          {plans.length === 0 ? (
            <p className="muted">Sem plano de manutenção associado aos equipamentos.</p>
          ) : (
            plans.map((plan) => {
              const tasks = [...plan.tasks].sort((a, b) => a.frequencyMonths - b.frequencyMonths || a.position - b.position);
              const count = covered.filter((c) => c.plan.id === plan.id).length;
              return (
                <div key={plan.id}>
                  <h3>
                    {plan.name}
                    <span className="muted font-normal">
                      , {count === 1 ? "1 equipamento" : `${count} equipamentos`}
                    </span>
                  </h3>
                  {plan.description && <p className="muted mb-2 text-[9pt]">{plan.description}</p>}
                  <div className="tbl-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: "58%" }}>Atividade (rotina)</th>
                          <th>Periodicidade</th>
                          <th>Registro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map((t) => (
                          <tr key={t.id}>
                            <td>
                              {t.title}
                              {t.instructions && <div className="muted text-[8pt]">{t.instructions}</div>}
                            </td>
                            <td>
                              {frequencyMonths[t.frequencyMonths] ?? `A cada ${t.frequencyMonths} meses`}
                              <span className="muted"> ({frequencyLetter(t.frequencyMonths)})</span>
                            </td>
                            <td className="muted">
                              {[t.measurementUnit ? `Medição em ${t.measurementUnit}` : null, t.requiresPhoto ? "Foto" : null]
                                .filter(Boolean)
                                .join(" e ") || "Checklist"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}

          <h3>Parâmetros de referência da qualidade do ar interior (Resolução ANVISA RE nº 9/2003)</h3>
          <div className="tbl-wrap keep">
            <table>
              <thead>
                <tr>
                  <th>Parâmetro</th>
                  <th>Valor de referência</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {RE9.map(([p, v, o]) => (
                  <tr key={p}>
                    <td>{p}</td>
                    <td className="num">{v}</td>
                    <td className="muted">{o}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted mt-2 text-[8.5pt]">
            A análise da qualidade do ar segue as normas técnicas da RE nº 9/2003 e é registrada em laudo próprio, anexado a este plano.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2>
            <span className="n">6</span>Cronograma anual de manutenção
          </h2>
          {covered.length === 0 ? (
            <p className="muted">Sem equipamentos, não há visitas programadas.</p>
          ) : (
            <>
              <div className="tbl-wrap">
                <table className="sched">
                  <thead>
                    <tr>
                      <th>Equipamento</th>
                      {months.map((m) => (
                        <th key={m}>{shortMonth(m)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {covered.map(({ equipment: e }) => (
                      <tr key={e.id}>
                        <td>
                          {e.location ?? e.type?.name ?? "Equipamento"}
                          <span className="muted num"> {formatEquipmentCode(e.code)}</span>
                        </td>
                        {months.map((m) => {
                          const v = comp.visits.find((x) => x.equipmentId === e.id && x.month === m);
                          if (!v) return <td key={m} />;
                          const cls =
                            v.status === "realizada" ? "ok" : v.status === "atrasada" || v.status === "cancelada" || v.status === "sem_registro" ? "miss" : "plan";
                          return (
                            <td key={m} className={cls} title={formatDate(v.date)}>
                              {v.letter}
                              {cls === "ok" ? "✓" : cls === "miss" ? "✕" : ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted mt-2 text-[8.5pt]">
                Cada marca indica a visita do mês e a maior periodicidade das rotinas que ela inclui:{" "}
                {LETTERS.filter(([, l]) => usedLetters.has(l))
                  .map(([n, l]) => `${l} ${(frequencyMonths[n] ?? "").toLowerCase()}`)
                  .join(", ")}
                . ✓ visita realizada; ✕ visita vencida sem OM concluída (situação em {formatDate(today)}).
              </p>
            </>
          )}
        </section>

        {/* 7 */}
        <section>
          <h2>
            <span className="n">7</span>Registro de execução
          </h2>
          {comp.executed.length === 0 ? (
            <p className="muted">Nenhuma ordem de manutenção concluída no período até {formatDate(today)}.</p>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>OM</th>
                    <th>Equipamento</th>
                    <th>Serviço</th>
                    <th>Executado por</th>
                    <th style={{ width: "32%" }}>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {comp.executed.map((w) => {
                    const c = w.equipmentId ? eqById.get(w.equipmentId) : null;
                    const obs = w.solution ?? "";
                    return (
                      <tr key={w.id}>
                        <td className="num">{formatDate(w.finishedAt ?? w.scheduledDate)}</td>
                        <td className="num">{formatOM(w.number)}</td>
                        <td>{c ? (c.equipment.location ?? c.equipment.type?.name ?? "Equipamento") : "—"}</td>
                        <td>{workOrderType[w.type]?.label ?? w.type}</td>
                        <td>{w.technician?.name ?? "—"}</td>
                        <td className="muted">{obs.length > 140 ? `${obs.slice(0, 137)}…` : obs || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted mt-2 text-[8.5pt]">
            Conformidade do período até {formatDate(today)}:{" "}
            {comp.rate == null
              ? "ainda sem visitas vencidas para avaliar."
              : `${comp.done} de ${comp.evaluated} visitas previstas realizadas (${formatNumber(Math.round(comp.rate * 1000) / 10)}%).`}{" "}
            Os relatórios completos das OMs, com checklist, medições, fotos e assinatura, ficam disponíveis no portal do cliente.
          </p>
        </section>

        {/* 8 */}
        <section className="keep">
          <h2>
            <span className="n">8</span>Recomendações aos usuários em caso de falha ou emergência
          </h2>
          <ul className="rec">
            <li>
              Em caso de falha, ruído anormal, cheiro de queimado, gotejamento ou vazamento de água, desligue o equipamento pelo controle e
              pelo disjuntor do circuito.
            </li>
            <li>
              Se houver odor de gás, fumaça ou suspeita de vazamento de fluido refrigerante, isole o ambiente: retire os ocupantes, abra portas
              e janelas para ventilar e não acione interruptores até a liberação do local.
            </li>
            <li>
              Não abra, limpe internamente ou tente reparar o equipamento. Esses serviços só devem ser feitos por técnico habilitado.
            </li>
            <li>Mantenha as grades de insuflamento e retorno desobstruídas e não altere as tomadas de ar externo.</li>
            <li>Em caso de incêndio, desligue a energia elétrica do sistema e acione o Corpo de Bombeiros pelo telefone 193.</li>
            <li>
              Comunique a ocorrência à {settings.companyName}
              {contact.length ? `: ${contact.join(", ")}` : ""}.
            </li>
          </ul>
        </section>

        {/* 9 */}
        <section className="keep">
          <h2>
            <span className="n">9</span>Termo de responsabilidade e assinaturas
          </h2>
          <p className="text-[9.5pt]">
            O responsável técnico declara que este plano atende às exigências da Lei nº 13.589/2018 e da Portaria MS nº 3.523/1998, e o
            proprietário, locatário ou preposto declara estar ciente das rotinas, do cronograma e das recomendações aqui descritas, mantendo
            este documento disponível à fiscalização sanitária.
          </p>
          <p className="mt-6 text-[9.5pt]">
            {settings.city ?? "_______________"}, ______ de ____________________ de ________.
          </p>
          <div className="sign">
            <div>
              <strong className="block font-semibold">{doc.responsibleName}</strong>
              Responsável técnico
              {doc.responsibleRegistry ? `, ${doc.responsibleRegistry}` : ""}
              {doc.artNumber ? <span className="block num">ART nº {doc.artNumber}</span> : null}
            </div>
            <div>
              <strong className="block font-semibold">{customer.name}</strong>
              Proprietário, locatário ou preposto
              {customer.document ? <span className="block num">{formatDocument(customer.document)}</span> : null}
            </div>
          </div>
        </section>

        <footer className="muted mt-10 border-t border-[var(--line)] pt-3 text-center text-[7.5pt]">
          Documento gerado pelo sistema Imperium em {formatDateTime(new Date())}. Os dados de execução refletem as ordens de manutenção
          registradas até esta data.
        </footer>
      </article>
    </div>
  );
}
