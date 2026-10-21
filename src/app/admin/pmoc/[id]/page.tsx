import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AlertTriangle, CircleCheck, Pencil, Printer, ShieldCheck, Trash2 } from "lucide-react";
import { db } from "@/db";
import { pmocDocuments } from "@/db/schema";
import { BarChart } from "@/components/charts/bar-chart";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { PageHeader } from "@/components/system/page-header";
import { DetailList, Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { addressLine, formatBTU, formatDate, formatDocument, formatEquipmentCode, formatNumber, formatOM } from "@/lib/format";
import { frequencyMonths } from "@/lib/labels";
import { param } from "@/lib/params";
import { deletePmoc } from "../actions";
import { FlashToast } from "../_components/flash-toast";
import { RenewDialog } from "../_components/renew-dialog";
import { coveredEquipment, isRenewed, pmocCompliance, shortMonth, validityOf, visitStatusLabel } from "../_lib/pmoc";

export const metadata: Metadata = { title: "PMOC" };

const UUID = /^[0-9a-f-]{36}$/i;
const FLASH: Record<string, string> = { criado: "PMOC criado", salvo: "PMOC salvo", renovado: "PMOC renovado" };

export default async function PmocDetailPage({ params, searchParams }: PageProps<"/admin/pmoc/[id]">) {
  const me = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const flash = Object.keys(FLASH).find((k) => param(sp, k)) ?? null;

  const doc = await db.query.pmocDocuments.findFirst({
    where: eq(pmocDocuments.id, id),
    with: { customer: true, site: true },
  });
  if (!doc) notFound();

  const today = todayISO();
  const [siblings, { covered, uncovered }] = await Promise.all([
    db.query.pmocDocuments.findMany({
      where: eq(pmocDocuments.customerId, doc.customerId),
      columns: { id: true, customerId: true, siteId: true, validFrom: true, validUntil: true, artNumber: true },
    }),
    coveredEquipment(doc),
  ]);
  const comp = await pmocCompliance(doc, covered, today);
  const sameSite = siblings
    .filter((s) => s.id !== doc.id && (s.siteId ?? null) === (doc.siteId ?? null))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const renewedBy = sameSite.filter((s) => s.validFrom > doc.validFrom).at(-1) ?? null;
  const validity = validityOf(doc, today, isRenewed(doc, siblings));

  const eqById = new Map(covered.map((c) => [c.equipment.id, c]));
  const nextVisit = new Map<string, string>();
  for (const v of comp.visits) {
    if ((v.status === "prevista" || v.status === "agendada") && !nextVisit.has(v.equipmentId)) nextVisit.set(v.equipmentId, v.date);
  }
  const lastDone = new Map<string, Date>();
  for (const w of comp.executed) if (w.equipmentId && w.finishedAt) lastDone.set(w.equipmentId, w.finishedAt);

  const rateTone = comp.rate == null ? undefined : comp.rate >= 0.9 ? "mint" : comp.rate >= 0.7 ? "brass" : "red";
  const chartData = comp.months.map((m) => ({ mes: shortMonth(m.key), previstas: m.previstas, realizadas: m.realizadas }));
  const totalBtu = covered.reduce((n, c) => n + (c.equipment.capacityBtu ?? 0), 0);
  const customerName = doc.customer.tradeName ?? doc.customer.name;

  return (
    <>
      <FlashToast message={flash ? FLASH[flash] : null} />
      <PageHeader
        back={{ href: "/admin/pmoc", label: "PMOC" }}
        title={customerName}
        description={
          doc.site
            ? `PMOC do local ${doc.site.name}${addressLine(doc.site) ? `, ${addressLine(doc.site)}` : ""}.`
            : "PMOC de todos os locais do cliente."
        }
        meta={
          <>
            <ToneBadge tone={validity.tone}>{validity.label}</ToneBadge>
            <span className="readout text-sm text-steel">
              Vigência de {formatDate(doc.validFrom)} a {formatDate(doc.validUntil)}
            </span>
          </>
        }
        actions={
          <>
            <Button asChild>
              <Link href={`/pmoc/${doc.id}/imprimir`} target="_blank" rel="noopener">
                <Printer className="size-4" />
                Imprimir PMOC
              </Link>
            </Button>
            {!renewedBy && (
              <RenewDialog
                id={doc.id}
                today={today}
                current={{
                  validFrom: doc.validFrom,
                  validUntil: doc.validUntil,
                  responsibleName: doc.responsibleName,
                  responsibleRegistry: doc.responsibleRegistry,
                }}
              />
            )}
            <Button asChild variant="outline">
              <Link href={`/admin/pmoc/${doc.id}/editar`}>
                <Pencil className="size-4" />
                Editar
              </Link>
            </Button>
            {me.role === "admin" && (
              <ConfirmAction
                action={deletePmoc.bind(null, doc.id)}
                title="Excluir este PMOC?"
                description="O documento sai da lista e do portal do cliente. Equipamentos, contratos e OMs não são afetados."
                confirmLabel="Excluir PMOC"
                success="PMOC excluído"
                variant="ghost"
                size="default"
                destructive
                className="text-steel hover:text-gauge-red"
              >
                <Trash2 className="size-4" />
                <span className="sr-only md:not-sr-only">Excluir</span>
              </ConfirmAction>
            )}
          </>
        }
      />

      {renewedBy && (
        <p className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-rime bg-night/60 px-4 py-3 text-sm text-steel">
          <CircleCheck className="size-4 text-mint" />
          Este documento foi renovado.
          <Link href={`/admin/pmoc/${renewedBy.id}`} className="text-frost hover:text-ice hover:underline">
            Ver o PMOC de {formatDate(renewedBy.validFrom)} a {formatDate(renewedBy.validUntil)}
          </Link>
        </p>
      )}

      <ReadoutBand
        className="mb-6"
        items={[
          { label: "Equipamentos cobertos", value: covered.length, hint: totalBtu ? `${formatNumber(Math.round((totalBtu / 12000) * 10) / 10)} TR no total` : undefined },
          { label: "Visitas previstas até hoje", value: comp.evaluated, hint: "Pelo cronograma dos planos" },
          { label: "Realizadas", value: comp.done, tone: comp.done ? "mint" : undefined, hint: "Com OM concluída no mês" },
          comp.rate == null
            ? { label: "Não conformidades", value: 0, hint: "Ainda sem visitas vencidas para avaliar" }
            : {
                label: "Conformidade",
                value: comp.rate,
                format: "percent" as const,
                tone: rateTone,
                hint: `${comp.nonConformities.length} não conformidade(s)`,
              },
        ]}
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Conformidade mês a mês" description="Visitas previstas pelo cronograma e visitas com OM concluída, desde o início da vigência.">
          {chartData.length === 0 ? (
            <EmptyState
              className="py-10"
              title={`A vigência começa em ${formatDate(doc.validFrom)}`}
              description="O acompanhamento mensal aparece a partir do primeiro mês do documento."
            />
          ) : covered.length === 0 ? (
            <EmptyState
              className="py-10"
              title="Sem equipamentos em plano PMOC"
              description="Sem equipamentos cobertos não há visitas previstas. Inclua os aparelhos do local em um contrato com plano PMOC."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/contratos/novo?customerId=${doc.customerId}`}>Criar contrato</Link>
                </Button>
              }
            />
          ) : (
            <BarChart
              data={chartData}
              xKey="mes"
              format="integer"
              height={260}
              series={[
                { key: "previstas", label: "Previstas" },
                { key: "realizadas", label: "Realizadas" },
              ]}
            />
          )}
        </Panel>

        <Panel title="Documento">
          <DetailList
            columns={1}
            items={[
              {
                label: "Cliente",
                value: (
                  <Link href={`/admin/clientes/${doc.customerId}`} className="text-frost hover:text-ice hover:underline">
                    {doc.customer.name}
                  </Link>
                ),
              },
              { label: doc.customer.personType === "pj" ? "CNPJ" : "CPF", value: doc.customer.document ? formatDocument(doc.customer.document) : "Não informado" },
              { label: "Responsável técnico", value: doc.responsibleName },
              { label: "Registro no conselho", value: doc.responsibleRegistry ?? "Não informado" },
              { label: "ART", value: <span className="readout">{doc.artNumber ?? "Não informada"}</span> },
              {
                label: "Área climatizada e ocupantes",
                value: doc.site
                  ? `${doc.site.areaM2 ? `${formatNumber(doc.site.areaM2)} m²` : "Área não informada"}, ${doc.site.occupants ? `${doc.site.occupants} ocupantes` : "ocupantes não informados"}`
                  : "Ver cada local",
              },
              ...(doc.notes ? [{ label: "Observações", value: <span className="whitespace-pre-line">{doc.notes}</span> }] : []),
            ]}
          />
          {sameSite.length > 0 && (
            <div className="mt-5 border-t border-rime pt-4">
              <p className="text-xs text-steel">Outros períodos deste local</p>
              <ul className="mt-2 space-y-1.5">
                {sameSite.map((s) => (
                  <li key={s.id}>
                    <Link href={`/admin/pmoc/${s.id}`} className="readout text-sm text-frost hover:text-ice hover:underline">
                      {formatDate(s.validFrom)} a {formatDate(s.validUntil)}
                    </Link>
                    {s.artNumber && <span className="readout ml-2 text-xs text-steel">ART {s.artNumber}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        className="mb-6"
        title="Não conformidades"
        description="Visitas previstas que já passaram sem OM concluída no mês."
        flush
      >
        {comp.nonConformities.length === 0 ? (
          <EmptyState
            className="py-10"
            icon={<ShieldCheck className="size-6 text-mint" />}
            title={comp.evaluated ? "Nenhuma não conformidade" : "Nada para avaliar ainda"}
            description={
              comp.evaluated
                ? "Todas as visitas previstas até hoje têm OM concluída."
                : "As visitas são avaliadas conforme as datas previstas passam."
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Visita prevista</TableHead>
                    <TableHead>Equipamento</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="pr-5 text-right">OM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comp.nonConformities.map((v) => {
                    const c = eqById.get(v.equipmentId);
                    const st = visitStatusLabel[v.status];
                    return (
                      <TableRow key={`${v.equipmentId}-${v.date}`}>
                        <TableCell className="readout pl-5 text-sm text-silver">{formatDate(v.date)}</TableCell>
                        <TableCell className="text-sm">
                          <span className="text-silver">{c?.equipment.location ?? "Equipamento"}</span>
                          <span className="block text-xs text-steel">
                            {c?.equipment.type?.name ?? "Tipo não informado"}, {formatEquipmentCode(c?.equipment.code)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                        </TableCell>
                        <TableCell className="pr-5 text-right">
                          {v.om ? (
                            <Link href={`/admin/oms/${v.om.id}`} className="readout text-sm text-frost hover:text-ice hover:underline">
                              {formatOM(v.om.number)}
                            </Link>
                          ) : (
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/admin/oms/nova?customerId=${doc.customerId}&equipmentId=${v.equipmentId}`}>Abrir OM</Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y divide-rime md:hidden">
              {comp.nonConformities.map((v) => {
                const c = eqById.get(v.equipmentId);
                const st = visitStatusLabel[v.status];
                return (
                  <li key={`m-${v.equipmentId}-${v.date}`} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-silver">{c?.equipment.location ?? "Equipamento"}</p>
                      <p className="readout text-xs text-steel">Prevista para {formatDate(v.date)}</p>
                      <div className="mt-1.5">
                        <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                      </div>
                    </div>
                    {v.om ? (
                      <Link href={`/admin/oms/${v.om.id}`} className="readout shrink-0 text-sm text-frost hover:text-ice">
                        {formatOM(v.om.number)}
                      </Link>
                    ) : (
                      <Button asChild variant="outline" size="sm" className="shrink-0">
                        <Link href={`/admin/oms/nova?customerId=${doc.customerId}&equipmentId=${v.equipmentId}`}>Abrir OM</Link>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      <Panel
        title="Equipamentos cobertos"
        description="Aparelhos do local em contrato ativo com plano PMOC. Eles formam a relação de equipamentos e o cronograma do documento."
        flush
      >
        {covered.length === 0 ? (
          <EmptyState
            className="py-10"
            title="Nenhum equipamento em plano PMOC"
            description="Inclua os aparelhos deste local em um contrato com um plano marcado como PMOC."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/contratos/novo?customerId=${doc.customerId}`}>Criar contrato</Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Equipamento</TableHead>
                <TableHead>Marca e modelo</TableHead>
                <TableHead className="text-right">Capacidade</TableHead>
                <TableHead>Fluido</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Última visita</TableHead>
                <TableHead className="pr-5">Próxima visita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {covered.map(({ equipment: e, plan, interval }) => (
                <TableRow key={e.id} className="relative">
                  <TableCell className="pl-5">
                    <Link href={`/admin/equipamentos/${e.id}`} className="font-medium text-silver after:absolute after:inset-0 hover:text-frost">
                      {e.location ?? e.type?.name ?? "Equipamento"}
                    </Link>
                    <span className="block text-xs text-steel">
                      {e.type?.name ?? "Tipo não informado"}, {formatEquipmentCode(e.code)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-steel">{[e.brand, e.model].filter(Boolean).join(" ") || "—"}</TableCell>
                  <TableCell className="readout text-right text-sm text-silver">
                    {formatBTU(e.capacityBtu)}
                    {e.capacityBtu ? <span className="block text-xs text-steel">{formatNumber(Math.round((e.capacityBtu / 12000) * 100) / 100)} TR</span> : null}
                  </TableCell>
                  <TableCell className="text-sm text-steel">{e.refrigerant ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    <span className="text-silver">{plan.name}</span>
                    <span className="block text-xs text-steel">Visita {(frequencyMonths[interval] ?? `a cada ${interval} meses`).toLowerCase()}</span>
                  </TableCell>
                  <TableCell className="readout text-sm text-steel">{lastDone.get(e.id) ? formatDate(lastDone.get(e.id)) : "Nenhuma no período"}</TableCell>
                  <TableCell className="readout pr-5 text-sm text-steel">{nextVisit.get(e.id) ? formatDate(nextVisit.get(e.id)) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {uncovered.length > 0 && (
          <div className="flex gap-3 border-t border-rime px-5 py-4 text-sm text-steel">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brass" />
            <p>
              {uncovered.length === 1 ? "1 equipamento deste local não está" : `${uncovered.length} equipamentos deste local não estão`} em plano PMOC:{" "}
              {uncovered.map((u, i) => (
                <span key={u.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/equipamentos/${u.id}`} className="text-frost hover:text-ice hover:underline">
                    {u.location ?? u.type?.name ?? formatEquipmentCode(u.code)}
                  </Link>
                  {u.contractLinks[0] ? ` (${u.contractLinks[0].plan.name})` : " (sem contrato)"}
                </span>
              ))}
              . Para a Lei 13.589/2018, todo sistema de climatização do ambiente deve constar no PMOC.
            </p>
          </div>
        )}
      </Panel>
    </>
  );
}
