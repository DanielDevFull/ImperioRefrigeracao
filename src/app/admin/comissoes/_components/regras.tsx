import Link from "next/link";
import { ChevronRight, Settings } from "lucide-react";
import { Panel } from "@/components/system/panel";
import { cn } from "@/lib/utils";
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

/*
 * A escada "esmaece" do mais para o menos específico. No escuro isso é a opacidade do degrau;
 * no claro a opacidade deixaria o texto abaixo de 4,5:1, então o texto fica inteiro e quem
 * esmaece é o véu azul do degrau (do mais forte ao cartão liso).
 */
const LADDER_LIGHT = [
  "light:bg-ice/8 light:ring-ice/30",
  "light:bg-ice/5 light:ring-ice/20",
  "light:bg-ice/[0.025] light:ring-ice/12",
  "light:bg-night light:ring-rime",
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
                className={cn(
                  "relative rounded-lg bg-night/60 px-3 py-2.5 ring-1 ring-rime opacity-(--step-fade) light:opacity-100",
                  LADDER_LIGHT[i],
                )}
                style={{ "--step-fade": 1 - i * 0.14 } as React.CSSProperties}
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

        <Panel title="Quando a comissão é liberada">
          <p className="text-xs text-steel">Gatilho atual</p>
          <p className="mt-0.5 text-base font-medium text-silver">{trigger.label}</p>
          <p className="mt-2 text-sm text-steel">{trigger.description}</p>
          <Link
            href="/admin/configuracoes"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md text-sm text-ice hover:underline"
          >
            <Settings className="size-3.5" />
            Alterar em Configurações
          </Link>
        </Panel>
      </div>

      <RulesWorkbench technicians={techs} rules={rules} />
    </div>
  );
}
