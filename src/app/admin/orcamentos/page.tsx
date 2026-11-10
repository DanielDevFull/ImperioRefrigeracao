import type { Metadata } from "next";
import Link from "next/link";
import { Eye, FileText, Plus } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager, SearchInput } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { QuoteStatusBadge } from "@/components/system/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/session";
import { formatBRL, formatDate, formatPhone, formatQuote } from "@/lib/format";
import { PAGE_SIZE, pageFrom, param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { daysToExpire, effectiveQuoteStatus, type EffectiveQuoteStatus } from "@/server/core/quotes";
import { ClickableRow } from "../clientes/_components/clickable-row";
import { isQuoteFilter, listQuotes, quotesOverview } from "./_lib/queries";

export const metadata: Metadata = { title: "Orçamentos" };

type Row = Awaited<ReturnType<typeof listQuotes>>["rows"][number];

export default async function OrcamentosPage({ searchParams }: PageProps<"/admin/orcamentos">) {
  await requireStaff();
  const sp = await searchParams;
  const q = param(sp, "q") ?? null;
  const raw = param(sp, "filtro") ?? "";
  const filter = isQuoteFilter(raw) ? raw : "";
  const page = pageFrom(sp);

  const [{ rows, total, today }, o] = await Promise.all([listQuotes({ filter, q, page }), quotesOverview()]);

  const newButton = (
    <Button asChild size="lg">
      <Link href="/admin/orcamentos/novo">
        <Plus />
        Novo orçamento
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Orçamentos"
        description="Para quem já é cliente ou para quem ainda não tem cadastro. O cliente aprova pelo link e a OM é gerada na hora."
        actions={newButton}
      />

      <ReadoutBand
        className="mb-8"
        items={[
          {
            label: "Em aberto",
            value: o.openValue,
            format: "brl",
            hint: o.open === 1 ? "1 orçamento aguardando" : `${o.open} orçamentos aguardando`,
          },
          {
            label: "Aprovado no mês",
            value: o.approvedMonth,
            format: "brl",
            tone: o.approvedMonth > 0 ? "mint" : undefined,
            hint: o.approvedMonthCount === 1 ? "1 orçamento virou OM" : `${o.approvedMonthCount} orçamentos viraram OM`,
          },
          {
            label: "Taxa de aprovação",
            value: o.approvalRate ?? 0,
            format: "percent",
            hint: o.approvalRate == null ? "sem respostas nos últimos 90 dias" : `${o.approved90} de ${o.decided90} nos últimos 90 dias`,
          },
          {
            label: "Vencem em até 3 dias",
            value: o.expiringSoon,
            tone: o.expiringSoon > 0 ? "brass" : undefined,
            hint: o.expired ? `${o.expired} já ${o.expired === 1 ? "venceu" : "venceram"} sem resposta` : "nenhum vencido",
            href: o.expired ? "/admin/orcamentos?filtro=vencidos" : undefined,
          },
        ]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          param="filtro"
          className="w-full flex-nowrap overflow-x-auto sm:w-fit [&>button]:shrink-0 [&>button]:whitespace-nowrap"
          options={[
            { value: "", label: "Em aberto", count: o.open },
            { value: "vencidos", label: "Vencidos", count: o.expired },
            { value: "aprovado", label: "Aprovados", count: o.approved },
            { value: "recusado", label: "Recusados", count: o.rejected },
            { value: "cancelado", label: "Cancelados", count: o.cancelled },
            { value: "todos", label: "Todos", count: o.all },
          ]}
        />
        <SearchInput placeholder="Nome, telefone, serviço ou ORC-…" className="lg:w-80" />
      </div>

      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-6 text-frost" />}
            title={q ? "Nenhum orçamento encontrado" : emptyTitle(filter)}
            description={
              q
                ? "Tente outro termo de busca ou troque a aba."
                : o.all
                  ? "Troque a aba para ver os demais orçamentos."
                  : "Monte o primeiro orçamento: a pessoa não precisa ter cadastro. Quando ela aprovar, o cadastro e a OM são criados."
            }
            action={!q && !o.all ? newButton : undefined}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-rime hover:bg-transparent">
                    <TableHead className="pl-5 text-steel">Orçamento</TableHead>
                    <TableHead className="text-steel">Para</TableHead>
                    <TableHead className="text-steel">Serviço</TableHead>
                    <TableHead className="text-steel">Situação</TableHead>
                    <TableHead className="text-steel">Validade</TableHead>
                    <TableHead className="pr-5 text-right text-steel">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const status = effectiveQuoteStatus(r.status, r.validUntil, today);
                    return (
                      <ClickableRow key={r.id} href={`/admin/orcamentos/${r.id}`} className={cn(status === "cancelado" && "opacity-60")}>
                        <TableCell className="pl-5">
                          <Link href={`/admin/orcamentos/${r.id}`} className="font-medium tabular-nums text-silver hover:text-frost">
                            {formatQuote(r.number)}
                          </Link>
                          <span className="block text-xs text-steel">{formatDate(r.createdAt)}</span>
                        </TableCell>
                        <TableCell className="max-w-[240px]">
                          <span className="block truncate text-silver">{r.contactName}</span>
                          <span className="block truncate text-xs text-steel">{contactLine(r)}</span>
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <span className="block truncate text-silver/90">{r.title}</span>
                        </TableCell>
                        <TableCell>
                          <StatusCell row={r} status={status} />
                        </TableCell>
                        <TableCell>
                          <ValidityCell row={r} status={status} today={today} />
                        </TableCell>
                        <TableCell className="pr-5 text-right font-medium tabular-nums text-silver">{formatBRL(r.total)}</TableCell>
                      </ClickableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-rime md:hidden">
              {rows.map((r) => {
                const status = effectiveQuoteStatus(r.status, r.validUntil, today);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/admin/orcamentos/${r.id}`}
                      className={cn("block px-4 py-3.5 active:bg-ice/5", status === "cancelado" && "opacity-60")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-silver">{r.contactName}</p>
                          <p className="truncate text-xs text-steel">
                            <span className="tabular-nums">{formatQuote(r.number)}</span>, {r.title}
                          </p>
                        </div>
                        <span className="shrink-0 font-medium tabular-nums text-silver">{formatBRL(r.total)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <QuoteStatusBadge status={status} />
                        <ValidityCell row={r} status={status} today={today} inline />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={total} />
      </Panel>
    </>
  );
}

function emptyTitle(filter: string) {
  switch (filter) {
    case "":
      return "Nenhum orçamento em aberto";
    case "vencidos":
      return "Nenhum orçamento vencido";
    case "aprovado":
      return "Nenhum orçamento aprovado ainda";
    case "recusado":
      return "Nenhum orçamento recusado";
    case "cancelado":
      return "Nenhum orçamento cancelado";
    default:
      return "Nenhum orçamento ainda";
  }
}

function contactLine(r: Row) {
  return [r.contactPhone ? formatPhone(r.contactPhone) : null, r.customerId ? null : "sem cadastro"].filter(Boolean).join(", ") || "Cliente cadastrado";
}

function StatusCell({ row, status }: { row: Row; status: EffectiveQuoteStatus }) {
  const note =
    status === "rascunho"
      ? "ainda não enviado"
      : status === "enviado" || status === "vencido"
        ? row.viewedAt
          ? null
          : row.sentAt
            ? `enviado em ${formatDate(row.sentAt)}`
            : null
        : row.decidedAt
          ? `em ${formatDate(row.decidedAt)}`
          : null;
  return (
    <div className="flex flex-col items-start gap-1">
      <QuoteStatusBadge status={status} />
      {row.viewedAt && (status === "enviado" || status === "vencido") ? (
        <span className="inline-flex items-center gap-1 text-xs text-steel">
          <Eye className="size-3" aria-hidden />
          visto pelo cliente
        </span>
      ) : (
        note && <span className="text-xs text-steel">{note}</span>
      )}
    </div>
  );
}

function ValidityCell({ row, status, today, inline }: { row: Row; status: EffectiveQuoteStatus; today: string; inline?: boolean }) {
  if (status !== "rascunho" && status !== "enviado" && status !== "vencido") {
    return inline ? null : <span className="text-sm text-steel">—</span>;
  }
  const days = daysToExpire(row.validUntil, today);
  const label =
    days < 0
      ? `venceu há ${-days} ${days === -1 ? "dia" : "dias"}`
      : days === 0
        ? "vence hoje"
        : days === 1
          ? "vence amanhã"
          : `vence em ${days} dias`;
  const tone = days < 0 ? "text-brass" : days <= 3 ? "text-brass" : "text-steel";
  if (inline) return <span className={cn("text-xs", tone)}>{label}</span>;
  return (
    <div className="text-sm">
      <span className="block tabular-nums text-silver/90">{formatDate(row.validUntil)}</span>
      <span className={cn("block text-xs", tone)}>{label}</span>
    </div>
  );
}
