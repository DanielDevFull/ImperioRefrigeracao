"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/system/confirm-action";
import { Field, nativeSelectClass, SubmitButton, useActionToast } from "@/components/system/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action";
import { formatDate, formatEquipmentCode } from "@/lib/format";
import { visitIntervalMonths } from "@/server/core/schedule";
import { periodLabel, plural } from "../../planos/_lib/preview";
import { addContractItem, removeContractItem, updateContractItem } from "../actions";
import { defaultPlanFor } from "../_lib/defaults";
import { nextVisitAfterChange, type ContractWindow, type ScheduleTask } from "../_lib/forecast";
import { openOrdersText } from "./contract-actions";

type PlanOpt = { id: string; name: string; equipmentTypeId: string | null; isPmoc: boolean; tasks: ScheduleTask[] };
type TechOpt = { id: string; name: string };
type FreeEquipment = { id: string; code: number; label: string; typeId: string | null; status: string };

function planHint(plan: PlanOpt | undefined) {
  if (!plan) return undefined;
  if (!plan.tasks.length) return "Plano sem tarefas: não gera OMs.";
  return `${periodLabel(visitIntervalMonths(plan.tasks))}, ${plural(plan.tasks.length, "tarefa", "tarefas")}.`;
}

export function AddItemButton({
  contractId,
  equipment,
  plans,
  technicians,
  defaultTechnicianId,
  today,
  preferPmoc,
  disabled,
}: {
  contractId: string;
  equipment: FreeEquipment[];
  plans: PlanOpt[];
  technicians: TechOpt[];
  defaultTechnicianId: string | null;
  today: string;
  preferPmoc: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Lista congelada ao abrir: depois de incluir, o equipamento some da lista do servidor
  // e o formulário precisa continuar montado para mostrar o resultado.
  const [snapshot, setSnapshot] = useState(equipment);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setSnapshot(equipment);
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Plus />
          Incluir equipamento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Incluir equipamento no contrato</DialogTitle>
          <DialogDescription>
            Só aparecem os equipamentos do cliente que ainda não estão em nenhum contrato ativo.
          </DialogDescription>
        </DialogHeader>
        {open &&
          (snapshot.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rime-strong px-4 py-6 text-center text-sm text-steel">
              Todos os equipamentos deste cliente já estão em contrato. Cadastre um novo aparelho na ficha do cliente.
            </p>
          ) : (
            <AddItemForm
              contractId={contractId}
              equipment={snapshot}
              plans={plans}
              technicians={technicians}
              defaultTechnicianId={defaultTechnicianId}
              today={today}
              preferPmoc={preferPmoc}
              onDone={() => setOpen(false)}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

function AddItemForm({
  contractId,
  equipment,
  plans,
  technicians,
  defaultTechnicianId,
  today,
  preferPmoc,
  onDone,
}: {
  contractId: string;
  equipment: FreeEquipment[];
  plans: PlanOpt[];
  technicians: TechOpt[];
  defaultTechnicianId: string | null;
  today: string;
  preferPmoc: boolean;
  onDone: () => void;
}) {
  const [state, action] = useActionState(addContractItem.bind(null, contractId), initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const fe = state.fieldErrors ?? {};
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? "");
  const eq = equipment.find((e) => e.id === equipmentId);
  const suggested = defaultPlanFor(eq?.typeId ?? null, plans, preferPmoc);
  const [planChoice, setPlanChoice] = useState<string | null>(null);
  const planId = planChoice ?? suggested?.id ?? "";
  return (
    <form action={action} className="grid gap-4" noValidate>
      <Field label="Equipamento" htmlFor="ai-eq" required error={fe.equipmentId}>
        <select
          id="ai-eq"
          name="equipmentId"
          value={equipmentId}
          onChange={(e) => {
            setEquipmentId(e.target.value);
            setPlanChoice(null);
          }}
          className={nativeSelectClass}
        >
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>
              {formatEquipmentCode(e.code)} {e.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Plano de manutenção" htmlFor="ai-plan" required error={fe.maintenancePlanId} hint={planHint(plans.find((p) => p.id === planId))}>
        <select id="ai-plan" name="maintenancePlanId" value={planId} onChange={(e) => setPlanChoice(e.target.value)} className={nativeSelectClass}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Primeira visita" htmlFor="ai-anchor" required error={fe.anchorDate} hint="As próximas seguem o intervalo do plano.">
          <Input id="ai-anchor" name="anchorDate" type="date" defaultValue={today} className="h-9" />
        </Field>
        <Field label="Técnico preferencial" htmlFor="ai-tech" error={fe.preferredTechnicianId}>
          <select id="ai-tech" name="preferredTechnicianId" defaultValue={defaultTechnicianId ?? ""} className={nativeSelectClass}>
            <option value="">Definir na agenda</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <DialogFooter>
        <SubmitButton className="h-9 px-4">Incluir equipamento</SubmitButton>
      </DialogFooter>
    </form>
  );
}

type EditableItem = {
  id: string;
  label: string;
  maintenancePlanId: string;
  /** Tarefas do plano atual (mesmo que ele esteja inativo e fora da lista) */
  planTasks: ScheduleTask[];
  anchorDate: string;
  preferredTechnicianId: string | null;
  /** OMs abertas ou agendadas (qualquer data), para a reatribuição */
  openWorkOrders: number;
  /** OMs automáticas abertas ou agendadas de hoje em diante: canceladas se a agenda mudar */
  futureOpen: number;
  /** Último vencimento das OMs que ficam se a agenda mudar */
  keptLastDue: string | null;
};

type ScheduleContext = { term: ContractWindow; today: string; contractActive: boolean };

export function EditItemButton({
  item,
  schedule,
  plans,
  technicians,
}: {
  item: EditableItem;
  schedule: ScheduleContext;
  plans: PlanOpt[];
  technicians: TechOpt[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Editar ${item.label}`} className="text-steel hover:text-frost">
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.label}</DialogTitle>
          <DialogDescription>
            Mudar o plano ou a âncora refaz a agenda: as OMs abertas ou agendadas de hoje em diante são canceladas e geradas de novo.
            Concluídas, em andamento e atrasadas ficam como estão.
          </DialogDescription>
        </DialogHeader>
        {open && <EditItemForm item={item} schedule={schedule} plans={plans} technicians={technicians} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** O que acontece com as OMs se a agenda mudar (mesma regra de updateContractItem). */
function scheduleChangeText(item: EditableItem, schedule: ScheduleContext, anchorDate: string, tasks: ScheduleTask[], planActive: boolean) {
  const cancel =
    item.futureOpen > 0
      ? `${plural(item.futureOpen, "OM aberta ou agendada", "OMs abertas ou agendadas")} de hoje em diante ${item.futureOpen === 1 ? "será cancelada" : "serão canceladas"}.`
      : "Nenhuma OM aberta de hoje em diante para cancelar.";
  if (!schedule.contractActive) return `${cancel} A nova agenda é gerada quando o contrato for reativado.`;
  if (!planActive) return `${cancel} O plano está inativo: a nova agenda só gera OMs depois que ele for reativado.`;
  const next = nextVisitAfterChange({ anchorDate, tasks }, schedule.term, schedule.today, item.keptLastDue);
  if (!next) return `${cancel} Nenhuma visita prevista na nova agenda.`;
  return `${cancel} Próxima visita na nova agenda: ${formatDate(next)}${next < schedule.today ? " (já vencida, entra na agenda de hoje)" : ""}.`;
}

function EditItemForm({
  item,
  schedule,
  plans,
  technicians,
  onDone,
}: {
  item: EditableItem;
  schedule: ScheduleContext;
  plans: PlanOpt[];
  technicians: TechOpt[];
  onDone: () => void;
}) {
  const [state, action] = useActionState(updateContractItem.bind(null, item.id), initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const fe = state.fieldErrors ?? {};
  const [planId, setPlanId] = useState(item.maintenancePlanId);
  const [anchor, setAnchor] = useState(item.anchorDate);
  const [tech, setTech] = useState(item.preferredTechnicianId ?? "");
  const current = plans.some((p) => p.id === item.maintenancePlanId);
  const scheduleChanged = /^\d{4}-\d{2}-\d{2}$/.test(anchor) && (anchor !== item.anchorDate || planId !== item.maintenancePlanId);
  const tasks = planId === item.maintenancePlanId ? item.planTasks : (plans.find((p) => p.id === planId)?.tasks ?? []);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <Field label="Plano de manutenção" htmlFor="ei-plan" required error={fe.maintenancePlanId} hint={planHint(plans.find((p) => p.id === planId))}>
        <select id="ei-plan" name="maintenancePlanId" value={planId} onChange={(e) => setPlanId(e.target.value)} className={nativeSelectClass}>
          {!current && <option value={item.maintenancePlanId}>Plano atual (inativo)</option>}
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Âncora (primeira visita)" htmlFor="ei-anchor" required error={fe.anchorDate}>
          <Input id="ei-anchor" name="anchorDate" type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="h-9" />
        </Field>
        <Field label="Técnico preferencial" htmlFor="ei-tech" error={fe.preferredTechnicianId}>
          <select id="ei-tech" name="preferredTechnicianId" value={tech} onChange={(e) => setTech(e.target.value)} className={nativeSelectClass}>
            <option value="">Definir na agenda</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {scheduleChanged && (
        <p role="status" className="rounded-lg border border-brass/30 bg-brass/10 p-3 text-sm text-brass">
          {scheduleChangeText(item, schedule, anchor, tasks, plans.some((p) => p.id === planId))}
        </p>
      )}
      {item.openWorkOrders > 0 && tech !== (item.preferredTechnicianId ?? "") && (
        <label className="flex items-start gap-2.5 rounded-lg border border-rime bg-night/50 p-3 text-sm">
          <Checkbox name="applyToOpen" defaultChecked className="mt-0.5" />
          <span>
            <span className="block text-silver">Reatribuir as OMs abertas deste equipamento</span>
            <span className="block text-xs text-steel">
              {plural(item.openWorkOrders, "OM aberta ou agendada passa", "OMs abertas ou agendadas passam")} para o novo técnico.
            </span>
          </span>
        </label>
      )}
      <DialogFooter>
        <SubmitButton className="h-9 px-4">Salvar alterações</SubmitButton>
      </DialogFooter>
    </form>
  );
}

export function RemoveItemButton({
  itemId,
  label,
  openCount,
  overdueCount,
}: {
  itemId: string;
  label: string;
  openCount: number;
  overdueCount: number;
}) {
  return (
    <ConfirmAction
      action={removeContractItem.bind(null, itemId)}
      title={`Remover ${label} do contrato?`}
      description={`${openOrdersText(openCount, overdueCount)} O equipamento fica livre para entrar em outro contrato. A mensalidade não muda: ajuste o valor em Editar dados, se for o caso.`}
      confirmLabel="Remover do contrato"
      destructive
      variant="ghost"
      size="icon-sm"
      className="text-steel hover:bg-gauge-red/10 hover:text-gauge-red"
    >
      <Trash2 />
      <span className="sr-only">Remover {label}</span>
    </ConfirmAction>
  );
}
