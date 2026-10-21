import type { Metadata } from "next";
import { PageHeader } from "@/components/system/page-header";
import { todayISO } from "@/lib/dates";
import { param } from "@/lib/params";
import { PlanForm } from "../_components/plan-form";
import { getPlanForEdit, planFormOptions } from "../_lib/queries";
import { emptyPlan, planToInitial } from "../_lib/to-initial";

export const metadata: Metadata = { title: "Novo plano" };

export default async function NovoPlanoPage({ searchParams }: PageProps<"/admin/planos/novo">) {
  const sp = await searchParams;
  const copyFrom = param(sp, "copiar");
  const [options, source] = await Promise.all([
    planFormOptions(),
    copyFrom && /^[0-9a-f-]{36}$/i.test(copyFrom) ? getPlanForEdit(copyFrom) : Promise.resolve(undefined),
  ]);
  const initial = source ? planToInitial(source, { copy: true }) : emptyPlan;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/planos", label: "Planos de manutenção" }}
        title={source ? "Duplicar plano" : "Novo plano"}
        description={
          source
            ? `Cópia de "${source.name}". Ajuste o que mudar e crie o novo plano; o original continua igual.`
            : "Monte o checklist da visita e a frequência de cada tarefa. A prévia ao lado mostra como as OMs serão geradas."
        }
      />
      <PlanForm planId={null} initial={initial} types={options.types} products={options.products} today={todayISO()} />
    </>
  );
}
