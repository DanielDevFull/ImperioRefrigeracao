import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, ExternalLink, Pencil, Printer, RotateCcw } from "lucide-react";
import { ConfirmAction } from "@/components/system/confirm-action";
import { PageHeader } from "@/components/system/page-header";
import { DetailList, Panel } from "@/components/system/panel";
import { QuoteStatusBadge, WorkOrderStatusBadge } from "@/components/system/status";
import { toneOnTint } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { requireStaff } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { addressLine, endSentence, formatBRL, formatCEP, formatCustomerCode, formatDate, formatDateTime, formatDocument, formatOM, formatPhone, formatQuote } from "@/lib/format";
import { labelOf, workOrderType } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { becomesOmMaterial, daysToExpire, effectiveQuoteStatus, isQuoteOpen, type EffectiveQuoteStatus } from "@/server/core/quotes";
import { findMatchingCustomer } from "@/server/quotes";
import { getSettings } from "@/server/settings";
import { ToastOnArrival } from "../../estoque/_components/param-controls";
import { isUuid } from "../../oms/_lib/constants";
import { activeTechnicians } from "../../oms/_lib/queries";
import { cancelQuote, reopenQuote } from "../actions";
import { ApproveQuoteDialog, CopyLinkButton, DuplicateQuoteButton, RejectQuoteDialog, SendWhatsappButton } from "../_components/quote-actions";
import { QuoteDocument } from "../_components/quote-document";
import { quotePublicUrl, quoteWhatsappLink } from "../_lib/link";
import { getQuote, quoteCustomerOptions } from "../_lib/queries";

export async function generateMetadata({ params }: PageProps<"/admin/orcamentos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const q = isUuid(id) ? await getQuote(id) : null;
  return { title: q ? formatQuote(q.number) : "Orçamento" };
}

const REASON = { documento: "CPF/CNPJ", telefone: "telefone", "e-mail": "e-mail" } as const;

export default async function OrcamentoPage({ params }: PageProps<"/admin/orcamentos/[id]">) {
  await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const q = await getQuote(id);
  if (!q) notFound();

  const today = todayISO();
  const status = effectiveQuoteStatus(q.status, q.validUntil, today);
  const open = isQuoteOpen(q.status);
  const needsCustomer = open && !q.customerId;
  const [settings, match, customers, technicians] = await Promise.all([
    getSettings(),
    needsCustomer ? findMatchingCustomer(db, q) : Promise.resolve(null),
    needsCustomer ? quoteCustomerOptions() : Promise.resolve([]),
    open ? activeTechnicians() : Promise.resolve([]),
  ]);

  const number = formatQuote(q.number);
  const url = quotePublicUrl(q.publicToken);
  const wa = quoteWhatsappLink(q, settings.companyName);
  const typeLabel = labelOf(workOrderType, q.workType).label;
  const materials = q.items.filter(becomesOmMaterial).length;
  const address = addressLine({ street: q.street, number: q.addressNumber, complement: q.complement, district: q.district, city: q.city, state: q.state });
  const days = daysToExpire(q.validUntil, today);

  const approve = open && (
    <ApproveQuoteDialog
      quote={{
        id: q.id,
        contactName: q.contactName,
        total: q.total,
        workType: q.workType,
        materials,
        customer: q.customer ? { code: q.customer.code, name: q.customer.tradeName ?? q.customer.name } : null,
        expiredOn: status === "vencido" ? q.validUntil : null,
      }}
      match={match}
      customers={customers}
      technicians={technicians}
      today={today}
      trigger={<Button>Aprovar e gerar OM</Button>}
    />
  );

  return (
    <>
      <ToastOnArrival param="criado" message="Orçamento criado" />
      <ToastOnArrival param="salvo" message="Orçamento salvo" />
      <PageHeader
        back={{ href: "/admin/orcamentos", label: "Orçamentos" }}
        title={<span className="tabular-nums">{number}</span>}
        description={endSentence(`${q.title}, para ${q.contactName}`)}
        meta={
          <>
            <QuoteStatusBadge status={status} />
            <span className="text-xs text-steel">
              Criado em {formatDateTime(q.createdAt)}
              {q.createdByName ? ` por ${q.createdByName}` : ""}
            </span>
          </>
        }
        actions={
          <>
            {open && (
              <Button variant="outline" asChild>
                <Link href={`/admin/orcamentos/${q.id}/editar`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/admin/orcamentos/${q.id}/imprimir`}>
                <Printer />
                Imprimir
              </Link>
            </Button>
            {open && wa && <SendWhatsappButton quoteId={q.id} href={wa} variant="outline" />}
            {approve}
            {q.workOrder && (
              <Button asChild>
                <Link href={`/admin/oms/${q.workOrder.id}`}>
                  <ClipboardList />
                  Abrir {formatOM(q.workOrder.number)}
                </Link>
              </Button>
            )}
            {(q.status === "recusado" || q.status === "cancelado") && (
              <ConfirmAction
                action={reopenQuote.bind(null, q.id)}
                title={`Reabrir ${number}?`}
                description={
                  q.validUntil < today
                    ? "Volta a rascunho com a validade padrão a partir de hoje. Confira os valores antes de reenviar."
                    : "Volta a rascunho para você ajustar e reenviar ao cliente."
                }
                confirmLabel="Reabrir orçamento"
                variant="default"
                size="default"
              >
                <RotateCcw />
                Reabrir
              </ConfirmAction>
            )}
          </>
        }
      />

      <QuoteTimeline q={q} status={status} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 min-w-0 lg:order-1">
          <QuoteDocument quote={q} company={settings} status={status} />
        </div>

        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          {open && (
            <Panel title="Link do cliente" description="O cliente vê o orçamento, aprova ou recusa pelo celular, sem senha.">
              <div className="space-y-3">
                <p className={cn("text-sm", status === "vencido" ? toneOnTint.brass : q.viewedAt ? toneOnTint.mint : "text-steel")}>
                  {status === "vencido"
                    ? `Venceu em ${formatDate(q.validUntil)}: pelo link não dá mais para aprovar. Edite a validade para reenviar.`
                    : q.viewedAt
                      ? `Visto pelo cliente em ${formatDateTime(q.viewedAt)}.`
                      : q.sentAt
                        ? `Enviado em ${formatDateTime(q.sentAt)}, ainda não aberto.`
                        : "Ainda não enviado."}
                </p>
                <p className="select-all break-all rounded-md bg-night/60 px-3 py-2 font-mono text-xs text-silver/90 ring-1 ring-rime">{url}</p>
                <div className="flex flex-wrap gap-2">
                  <CopyLinkButton quoteId={q.id} url={url} variant="outline" size="sm" />
                  <Button variant="ghost" size="sm" asChild>
                    <a href={url} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Ver como o cliente
                    </a>
                  </Button>
                </div>
                {!wa && <p className="text-xs text-steel">Sem WhatsApp no orçamento: copie o link e envie por onde preferir.</p>}
                {status !== "vencido" && (
                  <p className="text-xs text-steel">
                    {days === 0 ? "Vence hoje." : days === 1 ? "Vence amanhã." : `Vale por mais ${days} dias, até ${formatDate(q.validUntil)}.`}
                  </p>
                )}
              </div>
            </Panel>
          )}

          {q.workOrder && (
            <Panel title="OM gerada">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/admin/oms/${q.workOrder.id}`} className="font-medium tabular-nums text-silver hover:text-frost">
                    {formatOM(q.workOrder.number)}
                  </Link>
                  <WorkOrderStatusBadge status={q.workOrder.status} />
                </div>
                <p className="text-sm text-steel">
                  {q.decidedVia === "cliente"
                    ? `Aprovado pelo cliente${q.decidedByName ? ` (${q.decidedByName})` : ""} pelo link`
                    : `Aprovação registrada${q.decidedByUserName ? ` por ${q.decidedByUserName}` : ""}`}
                  {q.decidedAt ? ` em ${formatDateTime(q.decidedAt)}` : ""}.
                </p>
                <p className="text-sm text-steel">
                  {q.workOrder.scheduledDate ? `Agendada para ${formatDate(q.workOrder.scheduledDate)}.` : "Sem data ainda: está na fila de despacho."}
                </p>
              </div>
            </Panel>
          )}

          {q.status === "recusado" && (
            <Panel title="Recusa">
              <p className="text-sm text-silver">{q.rejectionReason ? `“${q.rejectionReason}”` : "Sem motivo informado."}</p>
              <p className="mt-2 text-xs text-steel">
                {q.decidedVia === "cliente"
                  ? `Recusado pelo cliente${q.decidedByName ? ` (${q.decidedByName})` : ""} pelo link`
                  : `Registrado${q.decidedByUserName ? ` por ${q.decidedByUserName}` : ""}`}
                {q.decidedAt ? ` em ${formatDateTime(q.decidedAt)}` : ""}.
              </p>
            </Panel>
          )}

          <Panel
            title="Contato"
            actions={
              q.customer && (
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/admin/clientes/${q.customer.id}`}>Ver cadastro</Link>
                </Button>
              )
            }
          >
            <DetailList
              columns={1}
              items={[
                { label: "Nome", value: q.contactName },
                ...(q.contactDocument ? [{ label: q.contactPersonType === "pj" ? "CNPJ" : "CPF", value: formatDocument(q.contactDocument) }] : []),
                {
                  label: "WhatsApp ou telefone",
                  value: q.contactPhone ? (
                    <a href={`tel:${q.contactPhone}`} className="tabular-nums hover:text-frost">
                      {formatPhone(q.contactPhone)}
                    </a>
                  ) : (
                    "—"
                  ),
                },
                ...(q.contactEmail ? [{ label: "E-mail", value: <a href={`mailto:${q.contactEmail}`} className="hover:text-frost">{q.contactEmail}</a> }] : []),
                {
                  label: "Local do serviço",
                  value: <span className="block whitespace-normal">{address ? `${address}${q.zip ? `, CEP ${formatCEP(q.zip)}` : ""}` : "A combinar"}</span>,
                },
              ]}
            />
            <p className="mt-4 border-t border-rime pt-4 text-sm text-steel">
              {q.customer
                ? `Cliente ${formatCustomerCode(q.customer.code)}, ${q.customer.tradeName ?? q.customer.name}.`
                : !open
                  ? "Sem cadastro."
                  : match
                    ? `Sem cadastro no orçamento. Na aprovação usa o cadastro de ${match.name} (${formatCustomerCode(match.code)}), que tem o mesmo ${REASON[match.reason]}.`
                    : "Sem cadastro. Na aprovação vira cliente novo com estes dados."}
            </p>
          </Panel>

          <Panel title="Valores">
            <DetailList
              columns={2}
              items={[
                { label: "Total", value: <span className="font-medium tabular-nums">{formatBRL(q.total)}</span> },
                { label: "Tipo de OM", value: typeLabel },
                { label: "Desconto", value: <span className="tabular-nums">{q.discount ? formatBRL(q.discount) : "—"}</span> },
                { label: "Materiais do estoque", value: materials ? `${materials} ${materials === 1 ? "item" : "itens"}` : "Nenhum" },
              ]}
            />
          </Panel>

          {(open || q.status === "aprovado") && (
            <Panel title="Mais ações">
              <div className="flex flex-wrap gap-2">
                <DuplicateQuoteButton quoteId={q.id} variant="outline" size="sm" />
                {open && <RejectQuoteDialog quoteId={q.id} variant="outline" size="sm" />}
                {open && (
                  <ConfirmAction
                    action={cancelQuote.bind(null, q.id)}
                    title={`Cancelar ${number}?`}
                    description="Use quando o orçamento foi feito por engano ou não vale mais. O link para de aceitar aprovação."
                    confirmLabel="Cancelar orçamento"
                    destructive
                    variant="ghost"
                  >
                    Cancelar orçamento
                  </ConfirmAction>
                )}
              </div>
            </Panel>
          )}
          {(q.status === "recusado" || q.status === "cancelado") && (
            <Panel title="Mais ações">
              <DuplicateQuoteButton quoteId={q.id} variant="outline" size="sm" />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function QuoteTimeline({ q, status }: { q: NonNullable<Awaited<ReturnType<typeof getQuote>>>; status: EffectiveQuoteStatus }) {
  const final: Record<string, { label: string; bar: string }> = {
    aprovado: { label: "Aprovado", bar: "bg-mint" },
    recusado: { label: "Recusado", bar: "bg-gauge-red" },
    cancelado: { label: "Cancelado", bar: "bg-steel" },
    vencido: { label: "Venceu", bar: "bg-brass" },
  };
  const end = final[status];
  const steps = [
    { label: "Criado", date: formatDate(q.createdAt), reached: true, bar: "bg-ice" },
    { label: "Enviado", date: q.sentAt ? formatDate(q.sentAt) : null, reached: !!q.sentAt, bar: "bg-ice" },
    { label: "Visto pelo cliente", date: q.viewedAt ? formatDate(q.viewedAt) : null, reached: !!q.viewedAt, bar: "bg-ice" },
    {
      label: end?.label ?? "Resposta",
      date: status === "vencido" ? formatDate(q.validUntil) : q.decidedAt ? formatDate(q.decidedAt) : null,
      reached: !!end,
      bar: end?.bar ?? "bg-ice",
    },
  ];
  return (
    <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Andamento do orçamento">
      {steps.map((s) => (
        <li key={s.label} className="min-w-0">
          <div className={cn("h-1 rounded-full", s.reached ? s.bar : "bg-ice/10")} />
          <p className={cn("mt-2 text-xs sm:truncate", s.reached ? "text-silver" : "text-steel/70 light:text-steel/90")}>
            {s.label}
            {s.date && <span className="block text-steel sm:ml-1.5 sm:inline">{s.date}</span>}
          </p>
        </li>
      ))}
    </ol>
  );
}
