import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy } from "lucide-react";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ContractStatusBadge } from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/dates";
import { formatContractCode } from "@/lib/format";
import { PlanForm } from "../_components/plan-form";
import { PlanStatusActions } from "../_components/plan-status-actions";
import { plural } from "../_lib/preview";
import { contractsUsingPlan, getPlanForEdit, planFormOptions } from "../_lib/queries";
import { planToInitial } from "../_lib/to-initial";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/admin/planos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const plan = UUID.test(id) ? await getPlanForEdit(id) : null;
  return { title: plan?.name ?? "Plano" };
}

export default async function PlanoPage({ params }: PageProps<"/admin/planos/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [plan, usage, options] = await Promise.all([getPlanForEdit(id), contractsUsingPlan(id), planFormOptions()]);
  if (!plan) notFound();

  const equipmentUsing = usage.active.reduce((n, c) => n + c.equipment, 0);
  const affected = usage.active.filter((c) => c.status === "ativo" || c.status === "suspenso");
  const deactivateWarning = affected.length
    ? `Estes contratos usam o plano e deixarão de gerar OMs para os equipamentos dele: ${affected
        .map((c) => `${formatContractCode(c.code)} ${c.customer} (${plural(c.equipment, "equipamento", "equipamentos")})`)
        .join("; ")}. OMs já geradas continuam valendo. Para não parar as visitas, troque o plano nesses contratos antes.`
    : "Nenhum contrato ativo usa este plano. Ele deixa de aparecer como opção ao montar contratos.";

  return (
    <>
      <PageHeader
        back={{ href: "/admin/planos", label: "Planos de manutenção" }}
        title={plan.name}
        meta={
          <>
            {plan.active ? <ToneBadge tone="mint">Ativo</ToneBadge> : <ToneBadge tone="steel">Inativo</ToneBadge>}
            {plan.isPmoc && <ToneBadge tone="mint">PMOC</ToneBadge>}
            <span className="text-sm text-steel">
              {equipmentUsing
                ? `Usado em ${plural(equipmentUsing, "equipamento", "equipamentos")} de ${plural(usage.active.length, "contrato", "contratos")}`
                : "Ainda não usado em contratos"}
            </span>
          </>
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm" className="text-steel hover:text-frost">
              <Link href={`/admin/planos/novo?copiar=${plan.id}`}>
                <Copy />
                Duplicar
              </Link>
            </Button>
            <PlanStatusActions
              planId={plan.id}
              planName={plan.name}
              active={plan.active}
              deactivateWarning={deactivateWarning}
              canDelete={!usage.everUsed}
            />
          </>
        }
      />

      {!plan.active && (
        <div role="status" className="mb-6 rounded-xl border border-brass/30 bg-brass/10 px-4 py-3 text-sm text-brass">
          Plano inativo: {equipmentUsing ? `os ${plural(equipmentUsing, "equipamento", "equipamentos")} que o usam não geram OMs.` : "não aparece ao montar contratos."}{" "}
          Reative o plano ou troque-o nos contratos.
        </div>
      )}

      <PlanForm
        key={plan.id}
        planId={plan.id}
        initial={planToInitial(plan)}
        types={options.types}
        products={options.products}
        today={todayISO()}
        aside={
          <Panel
            title="Contratos que usam este plano"
            description="Mudanças valem para as próximas OMs geradas. As OMs já geradas mantêm o checklist da época."
            flush
          >
            {usage.active.length === 0 ? (
              <p className="px-5 py-4 text-sm text-steel">
                Nenhum contrato ainda.{" "}
                <Link href="/admin/contratos/novo" className="text-ice hover:underline">
                  Criar contrato
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-rime">
                {usage.active.map((c) => (
                  <li key={c.contractId}>
                    <Link
                      href={`/admin/contratos/${c.contractId}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-ice/5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-silver">{c.customer}</span>
                        <span className="block text-xs text-steel">
                          {formatContractCode(c.code)}, {plural(c.equipment, "equipamento", "equipamentos")}
                        </span>
                      </span>
                      <ContractStatusBadge status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        }
      />
    </>
  );
}
