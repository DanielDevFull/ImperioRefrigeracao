import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  FileWarning,
  Headset,
  type LucideIcon,
  PackageMinus,
  Receipt,
  ShieldAlert,
  ShoppingCart,
  UserX,
} from "lucide-react";
import { Panel } from "@/components/system/panel";
import { toneText } from "@/components/system/tone-badge";
import { addDays, diffDays, type ISODate } from "@/lib/dates";
import { formatBRL, formatDayMonth, formatNumber, formatRelative } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { StockFilter } from "../estoque/_lib/queries";
import type { StatusGroup } from "../oms/_lib/constants";
import type { Attention } from "./queries";
import { plural } from "./util";

type Item = {
  key: string;
  icon: LucideIcon;
  tone: Tone;
  count: number;
  title: string;
  detail?: string;
  href: string;
  /** Em vez de levar a uma lista genérica, abre aqui mesmo os registros afetados. */
  expand?: { key: string; title: string; subtitle: string; detail: string; href: string }[];
};

const ICON_WRAP: Partial<Record<Tone, string>> = {
  red: "bg-gauge-red/10 ring-gauge-red/25",
  brass: "bg-brass/10 ring-brass/25",
  ice: "bg-ice/10 ring-ice/25",
  frost: "bg-frost/8 ring-frost/20",
};

const WEIGHT: Partial<Record<Tone, number>> = { red: 0, brass: 1, ice: 2, frost: 3 };

function buildItems(a: Attention, today: ISODate): Item[] {
  const items: Item[] = [];

  if (a.portal.count) {
    const ageDays = a.portal.oldest ? (Date.now() - new Date(a.portal.oldest).getTime()) / 86_400_000 : 0;
    items.push({
      key: "portal",
      icon: Headset,
      tone: ageDays >= 1 ? "red" : "brass",
      count: a.portal.count,
      title: plural(a.portal.count, "Chamado do portal aguardando triagem", "Chamados do portal aguardando triagem"),
      detail: a.portal.oldest
        ? `${plural(a.portal.count, "Aberto", "O mais antigo chegou")} ${formatRelative(a.portal.oldest)}`
        : undefined,
      href:
        a.portal.count === 1 && a.portal.firstId
          ? `/admin/oms/${a.portal.firstId}`
          : `/admin/oms?origem=portal_cliente&status=${"sem-tecnico" satisfies StatusGroup}`,
    });
  }

  if (a.issues.length) {
    const affected = a.issueContracts;
    const rest = a.issues.length - 1;
    items.push({
      key: "issues",
      icon: FileWarning,
      tone: "red",
      count: a.issues.length,
      title: plural(
        a.issues.length,
        "Problema de cadastro travando a geração de OMs",
        "Problemas de cadastro travando a geração de OMs",
      ),
      detail:
        affected.length > 1
          ? `Em ${affected.length} contratos. Abra para ver quais.`
          : `${a.issues[0].problem}${rest > 0 ? ` E mais ${rest}.` : ""}`,
      // Um contrato só: vai direto para ele. Vários: a lista abre aqui mesmo (a lista de contratos não mostra o problema).
      href: affected.length > 1 ? "/admin/contratos" : `/admin/contratos/${a.issues[0].contractId}`,
      expand:
        affected.length > 1
          ? affected.map((c) => ({
              key: c.id,
              title: c.customer,
              subtitle: c.name,
              detail: c.problems.join(" "),
              href: `/admin/contratos/${c.id}`,
            }))
          : undefined,
    });
  }

  if (a.noTech.count) {
    const soon = a.noTech.next != null && a.noTech.next <= addDays(today, 2);
    items.push({
      key: "no-tech",
      icon: UserX,
      tone: soon ? "red" : "brass",
      count: a.noTech.count,
      title: plural(a.noTech.count, "OM sem técnico definido", "OMs sem técnico definido"),
      detail: a.noTech.next
        ? `${plural(a.noTech.count, "Prevista", "A mais próxima está prevista")} para ${
            a.noTech.next <= today ? "hoje" : formatDayMonth(a.noTech.next)
          }`
        : "Sem data prevista",
      href:
        a.noTech.count === 1 && a.noTech.firstId
          ? `/admin/oms/${a.noTech.firstId}`
          : `/admin/oms?status=${"sem-tecnico" satisfies StatusGroup}`,
    });
  }

  if (a.proofs.count) {
    items.push({
      key: "proofs",
      icon: Receipt,
      tone: "brass",
      count: a.proofs.count,
      title: plural(a.proofs.count, "Comprovante de pagamento para conferir", "Comprovantes de pagamento para conferir"),
      detail: `${formatBRL(a.proofs.amount)} ${plural(a.proofs.count, "enviado pelo cliente", "enviados pelos clientes")}`,
      href: "/admin/financeiro/receber?status=em_analise",
    });
  }

  if (a.pmocs.length) {
    const expired = a.pmocs.filter((p) => p.validUntil < today).length;
    const first = a.pmocs[0];
    const days = diffDays(today, first.validUntil);
    items.push({
      key: "pmoc",
      icon: ShieldAlert,
      tone: expired ? "red" : "brass",
      count: a.pmocs.length,
      title: expired
        ? plural(a.pmocs.length, "PMOC vencido ou vencendo", "PMOCs vencidos ou vencendo")
        : plural(a.pmocs.length, "PMOC vence nos próximos 30 dias", "PMOCs vencem nos próximos 30 dias"),
      detail:
        days < 0
          ? `${first.customer} venceu em ${formatDayMonth(first.validUntil)}`
          : days === 0
            ? `${first.customer} vence hoje`
            : `${first.customer} vence em ${formatDayMonth(first.validUntil)}`,
      href: a.pmocs.length === 1 ? `/admin/pmoc/${first.id}` : "/admin/pmoc",
    });
  }

  if (a.lowStock.length) {
    const first = a.lowStock[0];
    items.push({
      key: "stock",
      icon: PackageMinus,
      tone: "brass",
      count: a.lowStock.length,
      title: plural(a.lowStock.length, "Produto abaixo do estoque mínimo", "Produtos abaixo do estoque mínimo"),
      detail: `${first.name}: ${formatNumber(first.total)} de ${formatNumber(first.min)} ${first.unit}${
        a.lowStock.length > 1 ? `, e mais ${a.lowStock.length - 1}` : ""
      }`,
      href:
        a.lowStock.length === 1 ? `/admin/estoque/${first.id}` : `/admin/estoque?filtro=${"abaixo" satisfies StockFilter}`,
    });
  }

  const requests = Object.values(a.requests).reduce((s, n) => s + n, 0);
  if (requests) {
    const parts = [
      a.requests.om ? `${a.requests.om} por falta em OM` : null,
      a.requests.estoque_minimo ? `${a.requests.estoque_minimo} por estoque mínimo` : null,
      a.requests.manual ? `${a.requests.manual} ${plural(a.requests.manual, "manual", "manuais")}` : null,
    ].filter(Boolean);
    items.push({
      key: "requests",
      icon: ShoppingCart,
      tone: a.requests.om ? "brass" : "ice",
      count: requests,
      title: plural(requests, "Solicitação de compra esperando pedido", "Solicitações de compra esperando pedido"),
      detail: parts.length ? capitalizeFirst(joinPt(parts as string[])) : undefined,
      href: "/admin/compras",
    });
  }

  return items
    .map((it, i) => ({ it, i }))
    .sort((x, y) => (WEIGHT[x.it.tone] ?? 9) - (WEIGHT[y.it.tone] ?? 9) || x.i - y.i)
    .map(({ it }) => it);
}

function joinPt(parts: string[]) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function capitalizeFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function AttentionList({ data, today }: { data: Attention; today: ISODate }) {
  const items = buildItems(data, today);
  const urgent = items.filter((i) => i.tone === "red").length;
  return (
    <Panel
      title="Precisa da sua atenção"
      description={
        items.length === 0
          ? "Nada pendente agora"
          : urgent
            ? `${items.length} ${plural(items.length, "assunto", "assuntos")}, ${urgent} ${plural(urgent, "urgente", "urgentes")}`
            : `${items.length} ${plural(items.length, "assunto", "assuntos")} para resolver`
      }
      flush
    >
      {items.length === 0 ? (
        <div className="flex items-start gap-3 px-5 py-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mint/10 ring-1 ring-mint/25">
            <CircleCheck className="size-4.5 text-mint" />
          </span>
          <div>
            <p className="text-sm font-medium text-silver">Tudo em ordem por aqui</p>
            <p className="mt-0.5 text-sm text-steel">
              Chamados, comprovantes, estoque, compras e PMOC estão em dia. Quando algo precisar de você, aparece aqui.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-rime">
          {items.map((it) => (
            <li key={it.key}>
              {it.expand ? (
                <details className="group/expand">
                  <summary
                    className={cn(
                      "group flex cursor-pointer list-none items-center gap-3.5 px-5 py-3.5 transition-colors",
                      "hover:bg-ice/5 focus-visible:bg-ice/5 focus-visible:outline-none [&::-webkit-details-marker]:hidden",
                    )}
                  >
                    <ItemBody it={it} />
                    <ChevronDown className="size-4 shrink-0 text-steel/50 transition-[color,rotate] group-hover:text-frost group-open/expand:rotate-180" />
                  </summary>
                  <ul className="max-h-96 space-y-0.5 overflow-y-auto pb-3 pl-[4.25rem] pr-5">
                    {it.expand.map((e) => (
                      <li key={e.key}>
                        <Link
                          href={e.href}
                          className="group/row -mx-2 flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-ice/5 focus-visible:bg-ice/5"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-silver">{e.title}</span>
                            <span className="block truncate text-xs text-steel">{e.subtitle}</span>
                            <span className={cn("mt-0.5 block text-xs", toneText[it.tone])}>{e.detail}</span>
                          </span>
                          <ChevronRight className="mt-0.5 size-4 shrink-0 text-steel/50 transition-colors group-hover/row:text-frost" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <Link
                  href={it.href}
                  className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-ice/5 focus-visible:bg-ice/5"
                >
                  <ItemBody it={it} />
                  <ChevronRight className="size-4 shrink-0 text-steel/50 transition-colors group-hover:text-frost" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ItemBody({ it }: { it: Item }) {
  const Icon = it.icon;
  return (
    <>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
          ICON_WRAP[it.tone] ?? ICON_WRAP.frost,
        )}
      >
        <Icon className={cn("size-4", toneText[it.tone])} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug text-silver">{it.title}</span>
        {it.detail && <span className="mt-0.5 block truncate text-xs text-steel">{it.detail}</span>}
      </span>
      <span className={cn("readout shrink-0 text-xl font-semibold", toneText[it.tone])}>{it.count}</span>
    </>
  );
}
