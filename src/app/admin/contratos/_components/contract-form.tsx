"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CalendarClock, Loader2, Receipt, Wrench } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/system/empty-state";
import { Field, nativeSelectClass } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Panel } from "@/components/system/panel";
import { EquipmentStatusBadge } from "@/components/system/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL, formatBTU, formatCompetence, formatContractCode, formatDate, formatDayMonth, formatEquipmentCode, onlyDigits } from "@/lib/format";
import { addDays, addMonths, startOfMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { visitIntervalMonths } from "@/server/core/schedule";
import { MonthStrip } from "../../planos/_components/month-strip";
import { periodLabel, plural } from "../../planos/_lib/preview";
import { createContract, loadCustomerEquipment } from "../actions";
import { defaultPlanFor } from "../_lib/defaults";
import { firstInvoice, invoicesGeneratedNow, monthlyForecast, visitsBetween, visitsGeneratedNow } from "../_lib/forecast";
import type { CoverageEquipment, CustomerOption, PlanOption } from "../_lib/queries";
import { CustomerPicker } from "./customer-picker";

type Tech = { id: string; name: string };
type Draft = { selected: boolean; planId: string; anchorDate: string; anchorDirty: boolean; technicianId: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const GENERATES = new Set(["ativo", "em_manutencao"]);

function equipmentLabel(e: CoverageEquipment) {
  const model = [e.brand, e.model].filter(Boolean).join(" ");
  return [e.typeName, model].filter(Boolean).join(", ") || "Equipamento";
}

function suggestName(customer: CustomerOption | null, plans: PlanOption[], n: number) {
  const tier = plans.some((p) => p.isPmoc) ? "Plano Imperial PMOC" : customer?.personType === "pj" ? "Plano Glacial Comercial" : "Plano Neve";
  return n ? `${tier} — ${plural(n, "aparelho", "aparelhos")}` : tier;
}

export function ContractForm({
  customers,
  plans,
  technicians,
  initialCustomerId,
  initialEquipment,
  today,
  invoiceLeadDays,
  horizonDays,
}: {
  customers: CustomerOption[];
  plans: PlanOption[];
  technicians: Tech[];
  initialCustomerId: string | null;
  initialEquipment: CoverageEquipment[];
  today: string;
  invoiceLeadDays: number;
  horizonDays: number;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [loadingEq, startLoad] = useTransition();
  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId);
  const [equipment, setEquipment] = useState<CoverageEquipment[]>(initialEquipment);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [name, setName] = useState("");
  const [nameDirty, setNameDirty] = useState(false);
  const [amount, setAmount] = useState(0);
  const [billingDay, setBillingDay] = useState("10");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const techIds = new Set(technicians.map((t) => t.id));
  const defaultTech = customer?.defaultTechnicianId && techIds.has(customer.defaultTechnicianId) ? customer.defaultTechnicianId : "";
  const validStart = ISO.test(startDate) ? startDate : today;
  const validEnd = ISO.test(endDate) ? endDate : null;
  const day = Math.min(28, Math.max(1, Number(billingDay) || 10));

  function draftFor(e: CoverageEquipment): Draft {
    return (
      drafts[e.id] ?? {
        selected: false,
        planId: defaultPlanFor(e.typeId, plans, customer?.personType === "pj")?.id ?? "",
        anchorDate: validStart,
        anchorDirty: false,
        technicianId: defaultTech,
      }
    );
  }
  function patchDraft(e: CoverageEquipment, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [e.id]: { ...draftFor(e), ...patch } }));
  }

  function chooseCustomer(id: string) {
    if (id === customerId) return;
    setCustomerId(id);
    setDrafts({});
    setErrors((er) => ({ ...er, customerId: "", items: "" }));
    window.history.replaceState(null, "", `/admin/contratos/novo?customerId=${id}`);
    startLoad(async () => {
      const r = await loadCustomerEquipment(id);
      if (!r.ok) {
        toast.error(r.error);
        setEquipment([]);
        return;
      }
      setEquipment(r.equipment);
    });
  }

  // Itens escolhidos, com a âncora acompanhando a data de início até ser editada
  const chosen = useMemo(
    () =>
      equipment
        .filter((e) => !e.coveredBy && drafts[e.id]?.selected)
        .map((e) => {
          const d = drafts[e.id];
          const plan = plans.find((p) => p.id === d.planId) ?? null;
          const anchorDate = d.anchorDirty && ISO.test(d.anchorDate) ? d.anchorDate : validStart;
          return { e, d, plan, anchorDate, tasks: plan?.tasks ?? [] };
        }),
    [equipment, drafts, plans, validStart],
  );

  const suggestion = suggestName(
    customer,
    chosen.map((c) => c.plan).filter((p): p is PlanOption => !!p),
    chosen.length,
  );
  const shownName = nameDirty ? name : suggestion;

  const summary = useMemo(() => {
    const win = { startDate: validStart, endDate: validEnd };
    const generating = chosen.filter((c) => GENERATES.has(c.e.status));
    const nowOMs = generating.flatMap((c) => visitsGeneratedNow({ anchorDate: c.anchorDate, tasks: c.tasks }, win, today, horizonDays));
    // primeiras visitas agrupadas por data
    const upcoming = new Map<string, number>();
    for (const c of generating) {
      const from = validStart > today ? validStart : today;
      for (const d of visitsBetween({ anchorDate: c.anchorDate, tasks: c.tasks }, win, from, addMonths(from, 12))) {
        upcoming.set(d, (upcoming.get(d) ?? 0) + 1);
      }
    }
    const groups = [...upcoming.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 4);
    const forecast = monthlyForecast(
      generating.map((c) => ({ anchorDate: c.anchorDate, tasks: c.tasks })),
      win,
      validStart > today ? validStart : today,
      12,
    );
    const visitsYear = forecast.reduce((n, c) => n + c.dates.length, 0);
    const contract = { ...win, billingDay: day };
    const invNow = invoicesGeneratedNow(contract, today, invoiceLeadDays);
    const first = firstInvoice(contract);
    return {
      nowOMs: nowOMs.length,
      horizonEnd: addDays(today, horizonDays),
      groups,
      forecast,
      visitsYear,
      invNow,
      overdueNow: invNow.filter((i) => i.dueDate < today).length,
      first,
      notGenerating: chosen.length - generating.length,
    };
  }, [chosen, validStart, validEnd, today, horizonDays, invoiceLeadDays, day]);

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    fd.set("customerId", customerId ?? "");
    fd.set("name", shownName);
    fd.set(
      "items",
      JSON.stringify(
        chosen.map((c) => ({
          equipmentId: c.e.id,
          maintenancePlanId: c.d.planId,
          anchorDate: c.anchorDate,
          preferredTechnicianId: c.d.technicianId || null,
        })),
      ),
    );
    startSave(async () => {
      const r = await createContract(fd);
      setErrors(r.fieldErrors ?? {});
      if (!r.ok || !r.id) {
        toast.error(r.error ?? "Não foi possível criar o contrato.");
        return;
      }
      toast.success(r.message ?? "Contrato criado");
      router.push(`/admin/contratos/${r.id}`);
    });
  }

  const itemError = (i: number, k: string) => errors[`items.${i}.${k}`];
  const coveredCount = equipment.filter((e) => e.coveredBy).length;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      onChange={(e) => {
        const t = e.target as unknown as HTMLInputElement;
        if (t.name === "monthlyAmount") setAmount(Number(onlyDigits(t.value) || 0) / 100);
      }}
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]"
    >
      <div className="min-w-0 space-y-6">
        <Panel title="Cliente" description="Quem contrata o plano. Os equipamentos dele aparecem logo abaixo.">
          <CustomerPicker
            customers={customers}
            value={customerId}
            onChange={chooseCustomer}
            loading={loadingEq}
            invalid={!!errors.customerId}
          />
          {errors.customerId && (
            <p id="customer-picker-error" className="mt-1.5 text-xs text-gauge-red">
              {errors.customerId}
            </p>
          )}
          {customer && (
            <p className="mt-2 text-xs text-steel">
              <Link href={`/admin/clientes/${customer.id}`} className="text-ice hover:underline">
                Abrir ficha do cliente
              </Link>
            </p>
          )}
        </Panel>

        <Panel title="Dados do contrato">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Nome do contrato"
              htmlFor="contract-name"
              required
              className="sm:col-span-2"
              error={errors.name}
              hint={nameDirty ? undefined : "Sugestão automática; muda conforme os equipamentos. Edite se preferir."}
            >
              <Input
                id="contract-name"
                value={shownName}
                onChange={(e) => {
                  setNameDirty(true);
                  setName(e.target.value);
                }}
                className="h-9"
                maxLength={120}
                aria-invalid={errors.name ? true : undefined}
              />
            </Field>
            <Field label="Mensalidade" htmlFor="monthlyAmount" required error={errors.monthlyAmount}>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-steel">R$</span>
                <MaskedInput
                  id="monthlyAmount"
                  name="monthlyAmount"
                  mask="money"
                  placeholder="0,00"
                  className="h-9 pl-9 tabular-nums"
                  aria-invalid={errors.monthlyAmount ? true : undefined}
                />
              </div>
            </Field>
            <Field
              label="Dia de vencimento"
              htmlFor="billingDay"
              required
              error={errors.billingDay}
              hint="De 1 a 28, todo mês."
            >
              <Input
                id="billingDay"
                name="billingDay"
                type="number"
                min={1}
                max={28}
                value={billingDay}
                onChange={(e) => setBillingDay(e.target.value)}
                className="h-9 tabular-nums"
                aria-invalid={errors.billingDay ? true : undefined}
              />
            </Field>
            <Field label="Início" htmlFor="startDate" required error={errors.startDate} hint="A primeira mensalidade é a do mês de início.">
              <Input
                id="startDate"
                name="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
              />
            </Field>
            <Field label="Término" htmlFor="endDate" error={errors.endDate} hint="Opcional. Sem término, renova todo mês.">
              <Input
                id="endDate"
                name="endDate"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9"
                aria-invalid={errors.endDate ? true : undefined}
              />
            </Field>
            <Field label="Observações" htmlFor="notes" className="sm:col-span-2" error={errors.notes}>
              <Textarea id="notes" name="notes" rows={2} maxLength={2000} placeholder="Condições combinadas, horários de acesso, contato no local…" />
            </Field>
          </div>
        </Panel>

        <Panel
          title="Equipamentos cobertos"
          description="Marque os aparelhos do contrato e escolha o plano de manutenção de cada um. Um equipamento só pode estar em um contrato ativo por vez."
          actions={
            chosen.length > 0 ? (
              <span className="text-xs tabular-nums text-steel">{plural(chosen.length, "selecionado", "selecionados")}</span>
            ) : undefined
          }
          flush
        >
          {!customer ? (
            <EmptyState title="Escolha o cliente primeiro" description="Os equipamentos cadastrados para ele aparecem aqui para você marcar." />
          ) : loadingEq ? (
            <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-steel">
              <Loader2 className="size-4 animate-spin" /> Carregando equipamentos…
            </div>
          ) : equipment.length === 0 ? (
            <EmptyState
              title="Este cliente não tem equipamentos"
              description="Cadastre os aparelhos na ficha do cliente e volte para montar o contrato."
              action={
                <Button asChild variant="outline">
                  <Link href={`/admin/clientes/${customer.id}`}>Cadastrar equipamento</Link>
                </Button>
              }
            />
          ) : (
            <>
              {coveredCount > 0 && coveredCount === equipment.length && (
                <p className="border-b border-rime bg-brass/8 px-5 py-3 text-sm text-brass">
                  Todos os equipamentos deste cliente já estão em contrato. Para mudar o plano de algum, abra o contrato atual.
                </p>
              )}
              <ul className="divide-y divide-rime">
                {equipment.map((e) => {
                  const d = draftFor(e);
                  const idx = chosen.findIndex((c) => c.e.id === e.id);
                  const covered = !!e.coveredBy;
                  const removed = e.status === "removido";
                  const disabled = covered || removed;
                  const plan = plans.find((p) => p.id === d.planId);
                  const interval = plan ? visitIntervalMonths(plan.tasks) : null;
                  return (
                    <li key={e.id} className={cn("px-4 py-3.5 sm:px-5", d.selected && !disabled && "bg-ice/[0.04]")}>
                      <label className={cn("flex items-start gap-3", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
                        <Checkbox
                          checked={d.selected && !disabled}
                          disabled={disabled}
                          onCheckedChange={(v) => patchDraft(e, { selected: v === true })}
                          className="mt-0.5"
                          aria-label={`Incluir ${formatEquipmentCode(e.code)} no contrato`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={cn("text-sm font-medium", disabled ? "text-steel" : "text-silver")}>{equipmentLabel(e)}</span>
                            <span className="text-xs tabular-nums text-steel">{formatEquipmentCode(e.code)}</span>
                            {e.status !== "ativo" && <EquipmentStatusBadge status={e.status} />}
                          </span>
                          <span className="mt-0.5 block text-xs text-steel">
                            {[e.location, e.siteName, e.capacityBtu ? formatBTU(e.capacityBtu) : null].filter(Boolean).join(", ") || "Sem local informado"}
                          </span>
                          {covered && e.coveredBy && (
                            <span className="mt-1 block text-xs text-brass">
                              Já coberto pelo contrato{" "}
                              <Link href={`/admin/contratos/${e.coveredBy.id}`} className="underline underline-offset-2 hover:text-frost">
                                {formatContractCode(e.coveredBy.code)}
                              </Link>{" "}
                              ({e.coveredBy.name}). Remova-o de lá para incluir aqui.
                            </span>
                          )}
                          {removed && <span className="mt-1 block text-xs text-steel">Equipamento removido não entra em contrato.</span>}
                          {!disabled && d.selected && !GENERATES.has(e.status) && (
                            <span className="mt-1 block text-xs text-brass">Inativo: não gera OMs até voltar a ficar ativo.</span>
                          )}
                          {!disabled && d.selected && !e.siteId && (
                            <span className="mt-1 block text-xs text-brass">Sem endereço de atendimento: as OMs saem sem local.</span>
                          )}
                        </span>
                      </label>

                      <AnimatePresence initial={false}>
                        {d.selected && !disabled && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="grid gap-3 pt-3 pl-7 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
                              <div className="min-w-0">
                                <label className="mb-1 block text-xs text-steel" htmlFor={`plan-${e.id}`}>
                                  Plano de manutenção
                                </label>
                                <select
                                  id={`plan-${e.id}`}
                                  value={d.planId}
                                  onChange={(ev) => patchDraft(e, { planId: ev.target.value })}
                                  className={cn(nativeSelectClass, idx >= 0 && itemError(idx, "maintenancePlanId") && "border-gauge-red/60")}
                                >
                                  {plans.length === 0 && <option value="">Nenhum plano ativo</option>}
                                  {plans.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                                <p className="mt-1 text-xs text-steel">
                                  {plan
                                    ? plan.tasks.length
                                      ? `${periodLabel(interval ?? 1)}, ${plural(plan.tasks.length, "tarefa", "tarefas")}`
                                      : "Plano sem tarefas: não gera OMs"
                                    : ""}
                                </p>
                                {idx >= 0 && itemError(idx, "maintenancePlanId") && (
                                  <p className="text-xs text-gauge-red">{itemError(idx, "maintenancePlanId")}</p>
                                )}
                              </div>
                              <div>
                                <label className="mb-1 block text-xs text-steel" htmlFor={`anchor-${e.id}`}>
                                  Primeira visita
                                </label>
                                <Input
                                  id={`anchor-${e.id}`}
                                  type="date"
                                  value={d.anchorDirty ? d.anchorDate : validStart}
                                  onChange={(ev) => patchDraft(e, { anchorDate: ev.target.value, anchorDirty: true })}
                                  className="h-9"
                                />
                                {idx >= 0 && itemError(idx, "anchorDate") && <p className="mt-1 text-xs text-gauge-red">{itemError(idx, "anchorDate")}</p>}
                              </div>
                              <div className="min-w-0">
                                <label className="mb-1 block text-xs text-steel" htmlFor={`tech-${e.id}`}>
                                  Técnico preferencial
                                </label>
                                <select
                                  id={`tech-${e.id}`}
                                  value={d.technicianId}
                                  onChange={(ev) => patchDraft(e, { technicianId: ev.target.value })}
                                  className={nativeSelectClass}
                                >
                                  <option value="">Definir na agenda</option>
                                  {technicians.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {errors.items && <p className="border-t border-rime px-5 py-3 text-sm text-gauge-red">{errors.items}</p>}
        </Panel>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
        <Panel title="O que acontece ao criar" description="Calculado com as mesmas regras da rotina diária.">
          <dl className="grid grid-cols-2 divide-x divide-rime rounded-xl bg-night/60 ring-1 ring-rime">
            <div className="px-3 py-2.5">
              <dt className="text-[0.72rem] text-steel">Por mês</dt>
              <dd className="readout text-lg font-semibold text-silver">{formatBRL(amount)}</dd>
            </div>
            <div className="px-3 py-2.5">
              <dt className="text-[0.72rem] text-steel">Visitas em 12 meses</dt>
              <dd className="readout text-lg font-semibold text-silver">{summary.visitsYear}</dd>
            </div>
          </dl>

          <section className="mt-5">
            <h3 className="flex items-center gap-2 text-sm font-medium text-silver">
              <Receipt className="size-4 text-ice" /> Mensalidades
            </h3>
            {summary.first ? (
              <p className="mt-1.5 text-sm text-steel">
                Primeira mensalidade em <span className="tabular-nums text-silver">{formatDate(summary.first.dueDate)}</span>
                {amount > 0 && (
                  <>
                    {" "}
                    de <span className="tabular-nums text-silver">{formatBRL(amount)}</span>
                  </>
                )}
                , competência {formatCompetence(summary.first.competence)}.
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-steel">O término é antes do primeiro vencimento: nenhuma mensalidade será gerada.</p>
            )}
            {summary.first && summary.first.dueDate < validStart && (
              <div className="mt-2 rounded-lg border border-brass/30 bg-brass/8 p-3 text-xs text-brass">
                <p className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Vence antes do início do contrato e já nasce vencida. Para cobrar a partir do mês que vem, comece o
                  contrato no dia 1º.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 border-brass/40 text-brass hover:bg-brass/10 hover:text-brass"
                  onClick={() => setStartDate(addMonths(startOfMonth(validStart), 1))}
                >
                  Começar em {formatDate(addMonths(startOfMonth(validStart), 1))}
                </Button>
              </div>
            )}
            <p className="mt-1.5 text-xs text-steel">
              {summary.invNow.length
                ? `Ao salvar: ${plural(summary.invNow.length, "mensalidade gerada", "mensalidades geradas")} agora${
                    summary.overdueNow ? `, ${summary.overdueNow} já vencida${summary.overdueNow > 1 ? "s" : ""}` : ""
                  }. `
                : "Nenhuma mensalidade sai agora. "}
              As próximas saem {invoiceLeadDays} dias antes de cada vencimento.
            </p>
          </section>

          <section className="mt-5">
            <h3 className="flex items-center gap-2 text-sm font-medium text-silver">
              <Wrench className="size-4 text-ice" /> OMs preventivas
            </h3>
            {chosen.length === 0 ? (
              <p className="mt-1.5 text-sm text-steel">Marque equipamentos para ver as visitas previstas.</p>
            ) : (
              <>
                <p className="mt-1.5 text-sm text-steel">
                  Ao salvar: <span className="text-silver">{plural(summary.nowOMs, "OM gerada", "OMs geradas")}</span> agora, com
                  visitas até {formatDate(summary.horizonEnd)}. As demais saem pela rotina diária.
                </p>
                {summary.groups.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {summary.groups.map(([date, n], i) => (
                      <li key={date} className="flex items-center gap-2 text-sm">
                        <CalendarClock className="size-3.5 text-steel" />
                        <span className="tabular-nums text-silver">{formatDayMonth(date)}</span>
                        <span className="text-steel">
                          {plural(n, "equipamento", "equipamentos")}
                          {i === 0 ? ", primeira visita" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {summary.notGenerating > 0 && (
                  <p className="mt-1.5 text-xs text-brass">
                    {plural(summary.notGenerating, "equipamento inativo não gera", "equipamentos inativos não geram")} OMs.
                  </p>
                )}
                <MonthStrip
                  className="mt-4"
                  cells={summary.forecast.map((c) => ({
                    month: c.month,
                    value: c.dates.length,
                    title: `${formatCompetence(c.month.slice(0, 7))}: ${plural(c.dates.length, "visita", "visitas")}`,
                  }))}
                />
                <p className="mt-2 text-xs text-steel">Visitas previstas por mês nos próximos 12 meses.</p>
              </>
            )}
          </section>
        </Panel>
      </aside>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-rime bg-abyss/85 px-4 py-3 backdrop-blur-xl md:-mx-8 md:px-8 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-steel">
            {customer ? <span className="text-silver">{customer.name}</span> : "Nenhum cliente escolhido"}
            {chosen.length > 0 && <>, {plural(chosen.length, "equipamento", "equipamentos")}</>}
            {amount > 0 && <>, {formatBRL(amount)} por mês</>}
          </p>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="h-9">
              <Link href="/admin/contratos">Cancelar</Link>
            </Button>
            <Button type="submit" className="h-9 px-4" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Criar contrato
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
