import Link from "next/link";
import { ChevronRight, Settings } from "lucide-react";
import { Panel } from "@/components/system/panel";
import { getSettings } from "@/server/settings";
import { technicianOptions } from "../../tecnicos/_lib/queries";
import { rulesWithUsage } from "../_lib/queries";
import { RulesWorkbench } from "./rules-workbench";

const LADDER = [
  { label: "Técnico + tipo", example: "Bruno em corretivas" },
  { label: "Técnico", example: "tudo do Bruno" },
  { label: "Tipo", example: "todas as corretivas" },
  { label: "Geral", example: "qualquer OM" },
];

const TRIGGERS: Record<string, { label: string; description: string }> = {
  conclusao: {
    label: "Na conclusão da OM",
    description: "A comissão nasce liberada assim que o técnico conclui a OM.",
  },
  recebimento: {
    label: "No recebimento do cliente",
    description:
      "Em serviços cobrados à parte, a comissão fica prevista até o cliente pagar. OMs de contrato são liberadas na conclusão.",
  },
};

export async function Regras() {
  const [rules, techs, settings] = await Promise.all([rulesWithUsage(), technicianOptions(), getSettings()]);
  const trigger = TRIGGERS[settings.commissionTrigger] ?? {
    label: settings.commissionTrigger,
    description: "Gatilho personalizado.",
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Como a regra é escolhida">
          <p className="text-sm text-steel">
            A regra mais específica vence: técnico + tipo › técnico › tipo › geral; empate pela prioridade.
          </p>
          <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LADDER.map((step, i) => (
              <li
                key={step.label}
                className="relative rounded-lg bg-night/60 px-3 py-2.5 ring-1 ring-rime"
                style={{ opacity: 1 - i * 0.14 }}
              >
                <span className="readout text-[0.7rem] text-ice">{i + 1}º</span>
                <p className="text-sm font-medium text-silver">{step.label}</p>
                <p className="text-xs text-steel">{step.example}</p>
                {i < LADDER.length - 1 && (
                  <ChevronRight className="absolute -right-2.5 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-steel/60 sm:block" />
                )}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-steel">
            Só regras ativas contam. A comissão é calculada uma vez, quando a OM é concluída; mudar uma regra não altera
            comissões já lançadas.
          </p>
        </Panel>

        <Panel
          title="Quando a comissão é liberada"
          actions={
            <Link
              href="/admin/configuracoes"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ice hover:bg-ice/10"
            >
              <Settings className="size-3.5" />
              Alterar em Configurações
            </Link>
          }
        >
          <p className="text-xs text-steel">Gatilho atual</p>
          <p className="mt-0.5 text-base font-medium text-silver">{trigger.label}</p>
          <p className="mt-2 text-sm text-steel">{trigger.description}</p>
        </Panel>
      </div>

      <RulesWorkbench technicians={techs} rules={rules} />
    </div>
  );
}
