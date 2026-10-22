import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { workOrders } from "@/db/schema";
import { getCurrentUser, STAFF_ROLES } from "@/lib/auth/session";
import {
  addressLine,
  formatBRL,
  formatBTU,
  formatDate,
  formatDateTime,
  formatDocument,
  formatEquipmentCode,
  formatNumber,
  formatOM,
  formatPhone,
  formatTime,
} from "@/lib/format";
import { labelOf, workOrderStatus, workOrderType } from "@/lib/labels";
import { getSettings } from "@/server/settings";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Relatório de atendimento", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PHOTO_ORDER = ["antes", "problema", "depois", "outro"];
const PHOTO_LABEL: Record<string, string> = { antes: "Antes", problema: "Problema encontrado", depois: "Depois", outro: "Registro" };

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`report-section mt-7 ${className ?? ""}`}>
      <h2 className="mb-3 flex items-center gap-3 text-[0.8rem] font-semibold tracking-[0.04em] text-[#1677d6]">
        {title}
        <span aria-hidden className="h-px flex-1 bg-[#d9e2ee]" />
      </h2>
      {children}
    </section>
  );
}

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] text-[#5b6b82]">{label}</dt>
      <dd className="mt-0.5 text-[0.82rem] text-[#0a1428]">{value || "—"}</dd>
    </div>
  );
}

function TextBlock({ label, text }: { label: string; text: string | null }) {
  if (!text?.trim()) return null;
  return (
    <div className="report-row">
      <p className="text-[0.7rem] text-[#5b6b82]">{label}</p>
      <p className="mt-0.5 whitespace-pre-line text-[0.82rem] leading-relaxed text-[#0a1428]">{text}</p>
    </div>
  );
}

export default async function OmReportPage({ params }: PageProps<"/relatorios/om/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?voltar=${encodeURIComponent(`/relatorios/om/${id}`)}`);
  if (!UUID.test(id)) notFound();

  const wo = await db.query.workOrders.findFirst({
    where: eq(workOrders.id, id),
    with: {
      customer: { columns: { name: true, tradeName: true, document: true, phone: true, email: true, userId: true } },
      site: true,
      equipment: { with: { type: { columns: { name: true } } } },
      plan: { columns: { name: true, isPmoc: true } },
      technician: { columns: { name: true, userId: true } },
      tasks: { orderBy: (t, { asc }) => [asc(t.position)] },
      photos: { orderBy: (p, { asc }) => [asc(p.createdAt)] },
      materials: { with: { product: { columns: { name: true, unit: true } } }, orderBy: (m, { asc }) => [asc(m.createdAt)] },
    },
  });
  if (!wo) notFound();

  const isStaff = STAFF_ROLES.includes(user.role);
  const isTech = user.role === "tecnico" && !!wo.technician?.userId && wo.technician.userId === user.id;
  const isOwner = user.role === "cliente" && !!wo.customer.userId && wo.customer.userId === user.id;
  if (!isStaff && !isTech && !isOwner) notFound();

  const settings = await getSettings();
  const back = isStaff ? `/admin/oms/${wo.id}` : isTech ? `/tecnico/om/${wo.id}` : `/portal/atendimentos/${wo.id}`;
  const isPmoc = wo.type === "pmoc" || !!wo.plan?.isPmoc;
  const charged = wo.materials.filter((m) => m.chargeCustomer);
  const chargedTotal = charged.reduce((s, m) => s + m.quantity * m.unitPrice, 0);
  const labor = wo.billable ? wo.laborAmount : 0;
  const total = wo.status === "concluida" ? wo.totalAmount : labor + chargedTotal;
  const photos = [...wo.photos].sort((a, b) => PHOTO_ORDER.indexOf(a.kind) - PHOTO_ORDER.indexOf(b.kind));
  const doneCount = wo.tasks.filter((t) => t.done).length;
  const eqp = wo.equipment;
  const companyAddress = [settings.address, [settings.city, settings.state].filter(Boolean).join("/")].filter(Boolean).join(", ");

  return (
    <div className="min-h-dvh px-3 py-6 sm:px-6 print:p-0">
      <style>{`
        @page { size: A4; margin: 12mm 12mm 14mm; }
        @media print {
          :root { color-scheme: light !important; }
          html, body { background: #fff !important; background-image: none !important; min-height: 0 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .report-paper { box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; width: auto !important; max-width: none !important; border-radius: 0 !important; }
          .report-section, .report-row, tr, img { break-inside: avoid; }
          a { color: inherit !important; text-decoration: none !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Link href={back} className="inline-flex items-center gap-1 text-sm text-steel hover:text-frost">
          <ChevronLeft className="size-4" />
          Voltar para a OM
        </Link>
        <PrintButton />
      </div>

      <article className="report-paper mx-auto max-w-[210mm] rounded-sm bg-white px-[8mm] py-[10mm] text-[#0a1428] shadow-[0_30px_80px_-20px_var(--shade)] light:ring-1 light:ring-rime sm:px-[14mm] sm:py-[14mm]">
        {/* Cabeçalho */}
        <header className="flex flex-col gap-5 border-b-2 border-[#0a1428] pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3.5">
            <Image src="/brand/emblem-256.webp" alt="" width={64} height={64} className="size-16 rounded-full" priority />
            <div className="text-[0.72rem] leading-relaxed text-[#4a5a70]">
              <p className="font-display text-lg font-bold tracking-[0.04em] text-[#0a1428]">{settings.companyName}</p>
              {settings.document && <p>CNPJ {formatDocument(settings.document)}</p>}
              <p>
                {[settings.phone && formatPhone(settings.phone), settings.email].filter(Boolean).join(", ")}
              </p>
              {companyAddress && <p>{companyAddress}</p>}
            </div>
          </div>
          <div className="sm:text-right">
            <h1 className="font-display text-[1.45rem] font-semibold leading-tight tracking-[0.02em] text-[#0a1428]">Relatório de atendimento</h1>
            <p className="mt-1 text-[1.05rem] font-semibold tabular-nums text-[#1677d6]">{formatOM(wo.number)}</p>
            <p className="mt-0.5 text-[0.72rem] text-[#4a5a70]">
              {labelOf(workOrderType, wo.type).label}, {labelOf(workOrderStatus, wo.status).label.toLowerCase()}
            </p>
          </div>
        </header>

        <p className="mt-5 text-[0.95rem] font-medium">{wo.title}</p>

        {/* Atendimento */}
        <Section title="Atendimento">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Pair label="Agendado para" value={wo.scheduledDate ? `${formatDate(wo.scheduledDate)}${wo.scheduledTime ? ` às ${formatTime(wo.scheduledTime)}` : ""}` : null} />
            <Pair label="Início" value={wo.startedAt ? formatDateTime(wo.startedAt) : null} />
            <Pair label="Término" value={wo.finishedAt ? formatDateTime(wo.finishedAt) : null} />
            <Pair label="Técnico" value={wo.technician?.name} />
            {wo.plan && <Pair label="Plano de manutenção" value={wo.plan.name} />}
          </dl>
        </Section>

        {/* Cliente e local */}
        <Section title="Cliente e local">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Pair label="Cliente" value={wo.customer.tradeName ? `${wo.customer.tradeName} (${wo.customer.name})` : wo.customer.name} />
            <Pair label="CPF/CNPJ" value={wo.customer.document ? formatDocument(wo.customer.document) : null} />
            <Pair label="Local" value={wo.site ? `${wo.site.name}${addressLine(wo.site) ? `, ${addressLine(wo.site)}` : ""}` : null} />
            <Pair label="Contato" value={[wo.customer.phone && formatPhone(wo.customer.phone), wo.customer.email].filter(Boolean).join(", ")} />
          </dl>
        </Section>

        {/* Equipamento */}
        {eqp && (
          <Section title="Equipamento">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Pair label="Tipo" value={eqp.type?.name} />
              <Pair label="Marca e modelo" value={[eqp.brand, eqp.model].filter(Boolean).join(" ")} />
              <Pair label="Número de série" value={eqp.serialNumber} />
              <Pair label="Código" value={formatEquipmentCode(eqp.code)} />
              <Pair label="Capacidade" value={eqp.capacityBtu ? formatBTU(eqp.capacityBtu) : null} />
              <Pair label="Fluido refrigerante" value={eqp.refrigerant} />
              <Pair label="Tensão" value={eqp.voltage} />
              <Pair label="Ambiente" value={eqp.location} />
            </dl>
          </Section>
        )}

        {/* Serviço */}
        {(wo.description || wo.diagnosis || wo.solution || wo.technicianNotes) && (
          <Section title="Serviço realizado">
            <div className="space-y-3">
              <TextBlock label="Problema relatado" text={wo.description} />
              <TextBlock label="Diagnóstico" text={wo.diagnosis} />
              <TextBlock label="Solução aplicada" text={wo.solution} />
              <TextBlock label="Observações do técnico" text={wo.technicianNotes} />
            </div>
          </Section>
        )}

        {/* Checklist */}
        {wo.tasks.length > 0 && (
          <Section title={`Checklist (${doneCount} de ${wo.tasks.length} itens executados)`}>
            <table className="w-full border-collapse text-[0.78rem]">
              <thead>
                <tr className="border-b border-[#c9d4e3] text-left text-[0.7rem] text-[#5b6b82]">
                  <th className="w-8 py-1.5 font-medium">
                    <span className="sr-only">Executado</span>
                  </th>
                  <th className="py-1.5 font-medium">Item</th>
                  <th className="py-1.5 pr-1 text-right font-medium">Medição</th>
                </tr>
              </thead>
              <tbody>
                {wo.tasks.map((t) => (
                  <tr key={t.id} className="border-b border-[#e6ecf4] align-top">
                    <td className="py-1.5">
                      <span
                        className={`inline-grid size-4 place-items-center rounded-[3px] border text-[0.65rem] font-bold leading-none ${t.done ? "border-[#0f8a6a] bg-[#0f8a6a] text-white" : "border-[#9aa8bb] text-transparent"}`}
                        aria-label={t.done ? "Executado" : "Não executado"}
                      >
                        ✓
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={t.done ? "" : "text-[#5b6b82]"}>{t.title}</span>
                      {!t.done && <span className="ml-1.5 text-[0.68rem] text-[#b4233a]">(não executado)</span>}
                      {t.notes && <span className="mt-0.5 block text-[0.7rem] text-[#4a5a70]">{t.notes}</span>}
                    </td>
                    <td className="py-1.5 pr-1 text-right tabular-nums">
                      {t.measurementUnit ? (t.measurementValue ? `${t.measurementValue} ${t.measurementUnit}` : "—") : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* Materiais */}
        {(wo.materials.length > 0 || (labor > 0 && wo.status !== "cancelada")) && (
          <Section title="Materiais e valores">
            {wo.materials.length > 0 && (
              <table className="w-full border-collapse text-[0.78rem]">
                <thead>
                  <tr className="border-b border-[#c9d4e3] text-left text-[0.7rem] text-[#5b6b82]">
                    <th className="py-1.5 font-medium">Material</th>
                    <th className="py-1.5 text-right font-medium">Quantidade</th>
                    <th className="py-1.5 text-right font-medium">Preço unitário</th>
                    <th className="py-1.5 pr-1 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {wo.materials.map((m) => (
                    <tr key={m.id} className="border-b border-[#e6ecf4]">
                      <td className="py-1.5 pr-3">{m.product.name}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatNumber(m.quantity)} {m.product.unit}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{m.chargeCustomer ? formatBRL(m.unitPrice) : "Incluso"}</td>
                      <td className="py-1.5 pr-1 text-right tabular-nums">{m.chargeCustomer ? formatBRL(m.quantity * m.unitPrice) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {wo.status !== "cancelada" && (labor > 0 || chargedTotal > 0) && (
              <dl className="ml-auto mt-3 w-full max-w-64 space-y-1 text-[0.8rem]">
                {labor > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#4a5a70]">Mão de obra</dt>
                    <dd className="tabular-nums">{formatBRL(labor)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-[#4a5a70]">Materiais cobrados</dt>
                  <dd className="tabular-nums">{formatBRL(chargedTotal)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-[#0a1428] pt-1.5 font-semibold">
                  <dt>{wo.status === "concluida" ? "Total do atendimento" : "Total previsto"}</dt>
                  <dd className="tabular-nums">{formatBRL(total)}</dd>
                </div>
              </dl>
            )}
          </Section>
        )}

        {/* Fotos */}
        {photos.length > 0 && (
          <Section title="Registro fotográfico">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p) => (
                <figure key={p.id} className="report-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption ?? PHOTO_LABEL[p.kind]} className="aspect-[4/3] w-full rounded-sm border border-[#d9e2ee] object-cover" />
                  <figcaption className="mt-1 text-[0.68rem] text-[#4a5a70]">
                    <span className="font-semibold text-[#0a1428]">{PHOTO_LABEL[p.kind] ?? p.kind}</span>
                    {p.caption ? `: ${p.caption}` : ""}
                  </figcaption>
                </figure>
              ))}
            </div>
          </Section>
        )}

        {/* Assinaturas */}
        <Section title="Aceite do cliente" className="report-row">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <div className="flex h-24 items-end justify-center border-b border-[#0a1428] pb-1">
                {wo.signatureUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={wo.signatureUrl} alt={`Assinatura de ${wo.signedByName ?? "cliente"}`} className="max-h-24 w-auto object-contain" />
                ) : (
                  <span className="pb-2 text-[0.72rem] text-[#5b6b82]">Sem assinatura registrada</span>
                )}
              </div>
              <p className="mt-1.5 text-[0.78rem] font-medium">{wo.signedByName ?? "Responsável pelo local"}</p>
              <p className="text-[0.7rem] text-[#5b6b82]">
                {wo.signatureUrl && wo.finishedAt ? `Assinado em ${formatDateTime(wo.finishedAt)}` : "Cliente"}
              </p>
            </div>
            <div>
              <div className="flex h-24 items-end justify-center border-b border-[#0a1428] pb-1" />
              <p className="mt-1.5 text-[0.78rem] font-medium">{wo.technician?.name ?? "Técnico responsável"}</p>
              <p className="text-[0.7rem] text-[#5b6b82]">Técnico, {settings.companyName}</p>
            </div>
          </div>
        </Section>

        <footer className="report-row mt-8 border-t border-[#d9e2ee] pt-3 text-[0.68rem] leading-relaxed text-[#5b6b82]">
          {isPmoc && settings.pmocResponsibleName && (
            <p className="mb-1.5 text-[0.72rem] text-[#0a1428]">
              Responsável técnico pelo PMOC: <span className="font-semibold">{settings.pmocResponsibleName}</span>
              {settings.pmocResponsibleRegistry ? `, ${settings.pmocResponsibleRegistry}` : ""}
              {settings.pmocResponsibleArt ? `, ART ${settings.pmocResponsibleArt}` : ""}. Atendimento realizado conforme a Lei 13.589/2018 e a Portaria GM/MS 3.523/1998.
            </p>
          )}
          <p>
            Documento gerado em {formatDateTime(new Date())} pelo sistema {settings.companyName}. {formatOM(wo.number)}.
          </p>
        </footer>
      </article>
    </div>
  );
}
