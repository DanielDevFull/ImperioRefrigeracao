"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { CalendarClock, ClipboardCheck, Loader2, ReceiptText, UserRound } from "lucide-react";
import { ActionForm, Field, FormSubmit, nativeSelectClass, useActionToast } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Panel } from "@/components/system/panel";
import { WorkOrderStatusBadge } from "@/components/system/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { formatBRL, formatDate, formatEquipmentCode } from "@/lib/format";
import { labelOf, priority as priorityLabels, workOrderType } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { createOmAction, customerContextAction } from "../../actions";
import { BILLABLE_BY_DEFAULT, PRIORITIES, WORK_ORDER_TYPES } from "../../_lib/constants";
import { Segmented } from "../../_components/segmented";
import { CustomerPicker, type CustomerOption } from "./customer-picker";

type Context = Awaited<ReturnType<typeof customerContextAction>>;
type Plan = {
  id: string;
  name: string;
  isPmoc: boolean;
  equipmentTypeId: string | null;
  estimatedMinutes: number;
  visitReferenceValue: number;
  taskCount: number;
};

export function NewOmForm({
  customers,
  technicians,
  plans,
  initialCustomerId,
  initialContext,
  initialEquipment,
  today,
}: {
  customers: CustomerOption[];
  technicians: { id: string; name: string; color: string }[];
  plans: Plan[];
  initialCustomerId: string | null;
  initialContext: Context | null;
  initialEquipment: { id: string; siteId: string | null } | null;
  today: string;
}) {
  const [state, action, pending] = useActionState(createOmAction, initialActionState);
  useActionToast(state);
  const fe = state.fieldErrors ?? {};

  const [type, setType] = useState("corretiva");
  const [prio, setPrio] = useState("normal");
  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId);
  const [ctx, setCtx] = useState<Context | null>(initialContext);
  const [loadingCtx, startCtx] = useTransition();
  const primarySite = initialContext?.sites.find((s) => s.isPrimary) ?? initialContext?.sites[0];
  const [siteId, setSiteId] = useState<string>(initialEquipment?.siteId ?? primarySite?.id ?? "");
  const [equipmentId, setEquipmentId] = useState<string>(initialEquipment?.id ?? "");
  const [planId, setPlanId] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [technicianId, setTechnicianId] = useState(initialContext?.defaultTechnicianId ?? "");
  const [techTouched, setTechTouched] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [billable, setBillable] = useState(BILLABLE_BY_DEFAULT.has("corretiva"));

  const customer = customers.find((c) => c.id === customerId);
  const equipmentList = useMemo(
    () => (ctx?.equipment ?? []).filter((e) => !siteId || !e.siteId || e.siteId === siteId),
    [ctx, siteId],
  );
  const eqp = ctx?.equipment.find((e) => e.id === equipmentId);
  const plan = plans.find((p) => p.id === planId);
  const sortedPlans = useMemo(() => {
    const typeId = eqp?.typeId;
    return [...plans].sort((a, b) => {
      const am = typeId && a.equipmentTypeId === typeId ? 0 : 1;
      const bm = typeId && b.equipmentTypeId === typeId ? 0 : 1;
      return am - bm || a.name.localeCompare(b.name);
    });
  }, [plans, eqp?.typeId]);

  const suggestedTitle = useMemo(() => {
    const head = plan ? plan.name : labelOf(workOrderType, type).label;
    if (!eqp) return head;
    const where = [eqp.typeName ?? eqp.brand, eqp.location].filter(Boolean).join(", ");
    return where ? `${head} — ${where}` : head;
  }, [plan, type, eqp]);
  const effectiveTitle = titleTouched ? title : suggestedTitle;

  const chooseCustomer = (id: string) => {
    if (id === customerId) return;
    setCustomerId(id);
    setSiteId("");
    setEquipmentId("");
    startCtx(async () => {
      const next = await customerContextAction(id);
      setCtx(next);
      const primary = next.sites.find((s) => s.isPrimary) ?? next.sites[0];
      setSiteId(primary?.id ?? "");
      if (!techTouched) setTechnicianId(next.defaultTechnicianId ?? "");
    });
  };

  const chooseType = (t: string) => {
    setType(t);
    setBillable(BILLABLE_BY_DEFAULT.has(t));
  };

  const willSchedule = Boolean(technicianId && date);
  const tech = technicians.find((t) => t.id === technicianId);

  return (
    <ActionForm action={action} pending={pending} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <Panel title="Serviço" description="O que será feito e com qual urgência.">
          <div className="space-y-5">
            <Segmented
              name="type"
              legend="Tipo de OM"
              value={type}
              onChange={chooseType}
              options={WORK_ORDER_TYPES.map((t) => ({ ...t, tone: labelOf(workOrderType, t.value).tone }))}
            />
            <Segmented
              name="priority"
              legend="Prioridade"
              value={prio}
              onChange={setPrio}
              options={PRIORITIES.map((p) => ({ ...p, tone: labelOf(priorityLabels, p.value).tone }))}
            />
          </div>
        </Panel>

        <Panel title="Cliente e equipamento" description="Onde o atendimento acontece.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Cliente" htmlFor="customer" required error={fe.customerId} className="sm:col-span-2">
              <CustomerPicker id="customer" customers={customers} value={customerId} onChange={chooseCustomer} invalid={!!fe.customerId} />
              <input type="hidden" name="customerId" value={customerId ?? ""} />
            </Field>
            <Field label="Local de atendimento" htmlFor="siteId" error={fe.siteId}>
              <div className="relative">
                <select
                  id="siteId"
                  name="siteId"
                  className={nativeSelectClass}
                  value={siteId}
                  disabled={!ctx || loadingCtx}
                  onChange={(e) => {
                    setSiteId(e.target.value);
                    const current = ctx?.equipment.find((x) => x.id === equipmentId);
                    if (current?.siteId && current.siteId !== e.target.value) setEquipmentId("");
                  }}
                >
                  <option value="">{!ctx ? "Escolha o cliente primeiro" : ctx.sites.length ? "Sem local definido" : "Cliente sem locais cadastrados"}</option>
                  {ctx?.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.district ? `, ${s.district}` : ""}
                    </option>
                  ))}
                </select>
                {loadingCtx && <Loader2 className="absolute right-8 top-1/2 size-4 -translate-y-1/2 animate-spin text-steel" />}
              </div>
            </Field>
            <Field
              label="Equipamento"
              htmlFor="equipmentId"
              error={fe.equipmentId}
              hint={ctx && !ctx.equipment.length ? "Este cliente ainda não tem equipamentos cadastrados." : "Opcional para visitas e instalações."}
            >
              <select
                id="equipmentId"
                name="equipmentId"
                className={nativeSelectClass}
                value={equipmentId}
                disabled={!ctx || loadingCtx}
                onChange={(e) => {
                  setEquipmentId(e.target.value);
                  const picked = ctx?.equipment.find((x) => x.id === e.target.value);
                  if (picked?.siteId) setSiteId(picked.siteId);
                }}
              >
                <option value="">Nenhum equipamento específico</option>
                {equipmentList.map((e) => (
                  <option key={e.id} value={e.id}>
                    {formatEquipmentCode(e.code)} {e.typeName ?? ""} {e.location ? `(${e.location})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Plano de manutenção"
              htmlFor="maintenancePlanId"
              error={fe.maintenancePlanId}
              hint={plan ? `${plan.taskCount} item(ns) de checklist serão copiados para a OM.` : "Opcional: copia o checklist do plano para a OM."}
              className="sm:col-span-2"
            >
              <select
                id="maintenancePlanId"
                name="maintenancePlanId"
                className={nativeSelectClass}
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              >
                <option value="">Sem plano (sem checklist)</option>
                {sortedPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {eqp?.typeId && p.equipmentTypeId === eqp.typeId ? " (indicado para este equipamento)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title="Descrição" description="O título aparece na agenda e no app do técnico.">
          <div className="space-y-4">
            <Field label="Título" htmlFor="title" required error={fe.title}>
              <Input
                id="title"
                name="title"
                className="h-9"
                value={effectiveTitle}
                maxLength={160}
                aria-invalid={!!fe.title || undefined}
                onChange={(e) => {
                  setTitleTouched(true);
                  setTitle(e.target.value);
                }}
              />
            </Field>
            <Field label="Problema relatado ou serviço a executar" htmlFor="description" error={fe.description}>
              <Textarea
                id="description"
                name="description"
                rows={4}
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: aparelho pingando na parede da recepção desde ontem; cliente pede visita pela manhã."
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Agendamento" description="Com técnico e data, a OM já nasce agendada e o técnico é avisado.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_8rem]">
            <Field label="Técnico" htmlFor="technicianId" error={fe.technicianId}>
              <select
                id="technicianId"
                name="technicianId"
                className={nativeSelectClass}
                value={technicianId}
                onChange={(e) => {
                  setTechTouched(true);
                  setTechnicianId(e.target.value);
                }}
              >
                <option value="">Definir depois</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {ctx?.defaultTechnicianId === t.id ? " (técnico do cliente)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Data" htmlFor="scheduledDate" error={fe.scheduledDate}>
              <Input id="scheduledDate" name="scheduledDate" type="date" className="h-9" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Horário" htmlFor="scheduledTime" error={fe.scheduledTime}>
              <Input id="scheduledTime" name="scheduledTime" type="time" className="h-9" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
        </Panel>

        <Panel title="Valores" description="Mão de obra cobrada do cliente; materiais são lançados na OM.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Mão de obra (R$)"
              htmlFor="laborAmount"
              error={fe.laborAmount}
              hint={plan ? `Em branco usa o valor de referência do plano (${formatBRL(plan.visitReferenceValue)}).` : undefined}
            >
              <MaskedInput id="laborAmount" name="laborAmount" mask="money" className="h-9 text-right tabular-nums" placeholder="0,00" />
            </Field>
            <div className="flex items-start justify-between gap-4 rounded-lg bg-night/50 p-3 ring-1 ring-rime">
              <div>
                <label htmlFor="billable" className="text-sm font-medium text-silver">
                  Cobrar do cliente ao concluir
                </label>
                <p className="mt-0.5 text-xs text-steel">
                  {billable ? "Gera conta a receber com mão de obra e materiais cobrados." : "Serviço coberto pelo contrato, sem cobrança avulsa."}
                </p>
              </div>
              <Switch id="billable" name="billable" checked={billable} onCheckedChange={setBillable} />
            </div>
          </div>
        </Panel>
      </div>

      {/* Resumo */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Panel title="Resumo" bodyClassName="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-steel">Nasce como</span>
            <WorkOrderStatusBadge status={willSchedule ? "agendada" : "aberta"} />
          </div>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3">
              <UserRound className="mt-0.5 size-4 shrink-0 text-steel" />
              <span className={cn(customer ? "text-silver" : "text-steel")}>
                {customer ? customer.tradeName ?? customer.name : "Nenhum cliente escolhido"}
                {eqp && <span className="block text-xs text-steel">{[eqp.typeName, eqp.location].filter(Boolean).join(", ")}</span>}
              </span>
            </li>
            <li className="flex gap-3">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-steel" />
              <span className={cn(willSchedule ? "text-silver" : "text-steel")}>
                {willSchedule
                  ? `${tech?.name} em ${formatDate(date)}${time ? ` às ${time}` : ""}`
                  : technicianId
                    ? `${tech?.name}, sem data ainda`
                    : "Sem técnico: fica na fila de despacho"}
              </span>
            </li>
            <li className="flex gap-3">
              <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-steel" />
              <span className={cn(plan ? "text-silver" : "text-steel")}>
                {plan ? `Checklist com ${plan.taskCount} itens de ${plan.name}` : "Sem checklist"}
              </span>
            </li>
            <li className="flex gap-3">
              <ReceiptText className="mt-0.5 size-4 shrink-0 text-steel" />
              <span className={cn(billable ? "text-silver" : "text-steel")}>
                {billable ? "Cobrança avulsa ao concluir" : "Sem cobrança avulsa"}
              </span>
            </li>
          </ul>
          {state.error && !Object.keys(fe).length && <p className="text-sm text-gauge-red">{state.error}</p>}
          <div className="flex flex-col gap-2 border-t border-rime pt-4">
            <FormSubmit className="h-9 w-full" disabled={loadingCtx}>
              Criar OM
            </FormSubmit>
            <Button variant="ghost" asChild className="h-9 w-full text-steel">
              <Link href="/admin/oms">Voltar sem salvar</Link>
            </Button>
          </div>
        </Panel>
      </aside>
    </ActionForm>
  );
}
