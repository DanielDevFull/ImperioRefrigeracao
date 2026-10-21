"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { LayoutGroup, motion } from "motion/react";
import { CircleAlert, FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnimatedNumber } from "@/components/brand/animated-number";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { nativeSelectClass } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Panel } from "@/components/system/panel";
import { ToneBadge, toneText } from "@/components/system/tone-badge";
import { formatBRL, formatNumber, onlyDigits } from "@/lib/format";
import { commissionBasis, labelOf, workOrderType } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { computeCommission, pickRule } from "@/server/core/commission";
import { deleteRule, setRuleActive } from "../actions";
import { formatRate, scopeOf } from "../_lib/format";
import { RuleDialog, type RuleRow, type TechOption } from "./rule-dialog";

export function RulesWorkbench({ rules, technicians }: { rules: RuleRow[]; technicians: TechOption[] }) {
  const techName = useMemo(() => new Map(technicians.map((t) => [t.id, t])), [technicians]);
  const activeTechs = technicians.filter((t) => t.active);
  const [simTech, setSimTech] = useState(activeTechs[0]?.id ?? technicians[0]?.id ?? "");
  const [simType, setSimType] = useState("preventiva");
  const [labor, setLabor] = useState(250);
  const [materials, setMaterials] = useState(0);

  // Ordem de aplicação calculada só com pickRule: tira o vencedor e escolhe de novo.
  const ranking = useMemo(() => {
    const out: RuleRow[] = [];
    let pool = rules;
    for (;;) {
      const r = pickRule(pool, simTech, simType);
      if (!r) break;
      out.push(r);
      pool = pool.filter((x) => x.id !== r.id);
    }
    return out;
  }, [rules, simTech, simType]);
  const winner = ranking[0] ?? null;
  const result = winner ? computeCommission(winner, { labor, materialsCharged: materials }) : null;

  const ties = useMemo(() => {
    const groups = new Map<string, RuleRow[]>();
    for (const r of rules.filter((x) => x.active)) {
      const k = `${r.technicianId ?? "*"}|${r.workOrderType ?? "*"}|${r.priority}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups.values()].filter((g) => g.length > 1);
  }, [rules]);

  return (
    <LayoutGroup>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <Panel
          flush
          title="Regras"
          description={`${rules.filter((r) => r.active).length} ativas de ${rules.length}`}
          className="xl:self-start"
          actions={
            <RuleDialog technicians={technicians}>
              <Button size="sm">
                <Plus />
                Nova regra
              </Button>
            </RuleDialog>
          }
        >
          {ties.length > 0 && (
            <div className="flex items-start gap-2 border-b border-rime bg-brass/8 px-5 py-3 text-sm text-silver">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-brass" />
              <p>
                Empate entre {ties.map((g) => g.map((r) => `"${r.name}"`).join(" e ")).join("; ")}: mesma abrangência e
                mesma prioridade. <span className="text-steel">Mude a prioridade de uma delas para o resultado ser previsível.</span>
              </p>
            </div>
          )}
          {rules.length === 0 ? (
            <EmptyState
              title="Nenhuma regra de comissão"
              description="Sem regras, as OMs concluídas não geram comissão. Comece por uma regra geral, por exemplo 8% da mão de obra."
              action={
                <RuleDialog technicians={technicians}>
                  <Button>
                    <Plus />
                    Criar primeira regra
                  </Button>
                </RuleDialog>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Regra</TableHead>
                  <TableHead>Vale para</TableHead>
                  <TableHead className="text-right">Cálculo</TableHead>
                  <TableHead className="text-right">Prioridade</TableHead>
                  <TableHead className="text-center">Ativa</TableHead>
                  <TableHead className="pr-5 text-right">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => {
                  const tech = r.technicianId ? techName.get(r.technicianId) : null;
                  const basis = commissionBasis[r.basis];
                  const isWinner = winner?.id === r.id;
                  return (
                    <TableRow key={r.id} className={cn(!r.active && "opacity-55")}>
                      <TableCell className="relative max-w-[16rem] pl-5">
                        {isWinner && (
                          <motion.span
                            layoutId="sim-winner"
                            className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-ice shadow-[0_0_12px_rgb(56_168_255/0.7)]"
                            transition={{ type: "spring", stiffness: 420, damping: 36 }}
                          />
                        )}
                        <p className="truncate font-medium text-silver">{r.name}</p>
                        <p className={cn("text-xs", isWinner ? "text-ice" : "text-steel")}>
                          {isWinner
                            ? "Aplicada na simulação"
                            : r.usage > 0
                              ? `Usada em ${r.usage} comiss${r.usage > 1 ? "ões" : "ão"}`
                              : "Ainda não usada"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          <span className="flex items-center gap-1.5 text-silver">
                            {tech ? (
                              <>
                                <span className="size-2 rounded-full" style={{ background: tech.color }} />
                                {tech.name.split(" ")[0]}
                              </>
                            ) : (
                              <span className="text-steel">Todos os técnicos</span>
                            )}
                          </span>
                          <span className="text-xs text-steel">
                            {r.workOrderType ? labelOf(workOrderType, r.workOrderType).label : "Todos os tipos"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="block font-medium tabular-nums text-silver">{formatRate(r.basis, r.rate)}</span>
                        <span className={cn("block whitespace-nowrap text-xs", toneText[basis?.tone ?? "steel"])}>
                          {basis?.label ?? r.basis}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-steel">{r.priority}</TableCell>
                      <TableCell className="text-center">
                        <RuleToggle id={r.id} active={r.active} name={r.name} />
                      </TableCell>
                      <TableCell className="pr-5">
                        <div className="flex justify-end gap-1">
                          <RuleDialog rule={r} technicians={technicians}>
                            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${r.name}`}>
                              <Pencil />
                            </Button>
                          </RuleDialog>
                          <ConfirmAction
                            action={deleteRule.bind(null, r.id)}
                            title={`Excluir a regra "${r.name}"?`}
                            description={
                              r.usage > 0
                                ? `As ${r.usage} comissões já calculadas com ela não mudam. Se quiser só pausar, desative a regra.`
                                : "Ela deixa de valer para as próximas OMs concluídas."
                            }
                            confirmLabel="Excluir regra"
                            destructive
                            variant="ghost"
                            size="icon-sm"
                            className="text-steel hover:text-gauge-red"
                          >
                            <Trash2 />
                            <span className="sr-only">Excluir {r.name}</span>
                          </ConfirmAction>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-2">
              <FlaskConical className="size-4 text-ice" />
              Simulador
            </span>
          }
          description="Veja qual regra vale e quanto o técnico recebe."
          className="xl:sticky xl:top-20 xl:self-start"
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 space-y-1.5 sm:col-span-1 xl:col-span-2">
              <span className="text-xs text-steel">Técnico</span>
              <select value={simTech} onChange={(e) => setSimTech(e.target.value)} className={nativeSelectClass}>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.active ? "" : " (inativo)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 space-y-1.5 sm:col-span-1 xl:col-span-2">
              <span className="text-xs text-steel">Tipo de OM</span>
              <select value={simType} onChange={(e) => setSimType(e.target.value)} className={nativeSelectClass}>
                {Object.entries(workOrderType).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-steel">Mão de obra</span>
              <MaskedInput
                mask="money"
                defaultValue={250}
                onInput={(e) => setLabor(Number(onlyDigits(e.currentTarget.value)) / 100)}
                className="text-right tabular-nums"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-steel">Materiais cobrados</span>
              <MaskedInput
                mask="money"
                defaultValue={0}
                onInput={(e) => setMaterials(Number(onlyDigits(e.currentTarget.value)) / 100)}
                className="text-right tabular-nums"
                placeholder="0,00"
              />
            </label>
          </div>

          <div className="mt-5 rounded-xl bg-night/70 p-4 ring-1 ring-rime">
            {winner && result ? (
              <>
                <p className="text-xs text-steel">Comissão do técnico</p>
                <AnimatedNumber
                  value={result.amount}
                  format="brl"
                  duration={0.5}
                  className="readout mt-1 block text-3xl font-semibold text-silver"
                />
                <p className="mt-1 text-sm text-steel">
                  {winner.basis === "fixo_por_om"
                    ? "Valor fixo por OM concluída"
                    : `${formatNumber(winner.rate)}% de ${formatBRL(result.base)} (${commissionBasis[winner.basis]?.label.replace(/^% d[aoe]s? /, "") ?? ""})`}
                </p>
                <div className="mt-4 border-t border-rime pt-3">
                  <p className="text-xs text-steel">Regra aplicada</p>
                  <p className="mt-0.5 font-medium text-silver">{winner.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ToneBadge tone="ice">{scopeOf(winner).label}</ToneBadge>
                    <span className="text-xs text-steel">prioridade {winner.priority}</span>
                  </p>
                </div>
                {ranking.length > 1 && (
                  <div className="mt-3">
                    <p className="text-xs text-steel">Também se aplicariam</p>
                    <ul className="mt-1.5 space-y-1">
                      {ranking.slice(1, 5).map((r) => {
                        const sameScope = scopeOf(r).rank === scopeOf(winner).rank;
                        return (
                          <li key={r.id} className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="truncate text-steel">{r.name}</span>
                            <span className="shrink-0 text-steel/70">
                              {sameScope ? "prioridade menor" : `menos específica (${scopeOf(r).label.toLowerCase()})`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-steel">
                Nenhuma regra ativa vale para esta combinação: a OM não gera comissão.
                <span className="mt-1 block text-xs">Crie uma regra geral para cobrir todos os casos.</span>
              </p>
            )}
          </div>
        </Panel>
      </div>
    </LayoutGroup>
  );
}

function RuleToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(active);
  return (
    <Switch
      checked={value}
      disabled={pending}
      aria-label={value ? `Desativar ${name}` : `Ativar ${name}`}
      onCheckedChange={(checked) =>
        start(async () => {
          setValue(checked);
          const r = await setRuleActive(id, checked);
          if (r.ok) toast.success(r.message ?? "Regra atualizada");
          else toast.error(r.error ?? "Não foi possível alterar a regra.");
        })
      }
    />
  );
}
