"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field, nativeSelectClass } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { visitIntervalMonths } from "@/server/core/schedule";
import { savePlan } from "../actions";
import { intervalLabel, plural } from "../_lib/preview";
import { MaterialsEditor } from "./materials-editor";
import { PlanPreview } from "./plan-preview";
import { TaskEditor } from "./task-editor";
import { parseQty, type DraftMaterial, type DraftTask, type PlanInitial, type ProductOption } from "./types";

export function PlanForm({
  planId,
  initial,
  types,
  products,
  today,
  aside,
}: {
  planId: string | null;
  initial: PlanInitial;
  types: { id: string; name: string }[];
  products: ProductOption[];
  today: string;
  aside?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tasks, setTasks] = useState<DraftTask[]>(initial.tasks);
  const [materials, setMaterials] = useState<DraftMaterial[]>(initial.materials);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [materialErrors, setMaterialErrors] = useState<Record<string, { productId?: string; quantity?: string }>>({});
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [isPmoc, setIsPmoc] = useState(initial.isPmoc);
  const seq = useRef(0);
  const newKey = (p: string) => `${p}-${++seq.current}`;

  const interval = useMemo(() => visitIntervalMonths(tasks), [tasks]);
  const visitsPerYear = Math.max(1, Math.floor(12 / interval));

  function patchTask(key: string, patch: Partial<DraftTask>) {
    setTasks((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }
  function moveTask(key: string, dir: -1 | 1) {
    setTasks((ts) => {
      const i = ts.findIndex((t) => t.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ts.length) return ts;
      const next = [...ts];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setErrors({});
  }
  function removeTask(key: string) {
    setTasks((ts) => ts.filter((t) => t.key !== key));
    setErrors({});
  }
  function addTask() {
    const key = newKey("task");
    const last = tasks[tasks.length - 1];
    setTasks((ts) => [
      ...ts,
      {
        key,
        id: null,
        title: "",
        instructions: "",
        frequencyMonths: last?.frequencyMonths ?? 1,
        measurementUnit: "",
        requiresPhoto: false,
      },
    ]);
    setFocusKey(key);
  }
  function addMaterial() {
    const key = newKey("mat");
    setMaterials((ms) => [...ms, { key, productId: "", quantity: "1" }]);
    setFocusKey(key);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sentMaterials = materials.filter((m) => m.productId || m.quantity.trim());
    fd.set(
      "tasks",
      JSON.stringify(
        tasks.map((t) => ({
          id: t.id,
          title: t.title,
          instructions: t.instructions.trim() || null,
          frequencyMonths: t.frequencyMonths,
          measurementUnit: t.measurementUnit.trim() || null,
          requiresPhoto: t.requiresPhoto,
        })),
      ),
    );
    fd.set(
      "materials",
      JSON.stringify(sentMaterials.map((m) => ({ productId: m.productId, quantity: parseQty(m.quantity) ?? undefined }))),
    );
    start(async () => {
      const r = await savePlan(planId, fd);
      const fe = r.fieldErrors ?? {};
      setErrors(fe);
      const me: Record<string, { productId?: string; quantity?: string }> = {};
      for (const [k, msg] of Object.entries(fe)) {
        const m = /^materials\.(\d+)\.(productId|quantity)$/.exec(k);
        if (!m) continue;
        const row = sentMaterials[Number(m[1])];
        if (row) me[row.key] = { ...me[row.key], [m[2]]: msg };
      }
      setMaterialErrors(me);
      if (!r.ok) {
        toast.error(r.error ?? "Não foi possível salvar o plano.");
        return;
      }
      toast.success(r.message ?? "Plano salvo");
      if (!planId && r.id) {
        router.push(`/admin/planos/${r.id}`);
        return;
      }
      // Mantém as chaves das linhas (sem remontar) e passa a usar os ids gravados.
      if (r.tasks) {
        const saved = r.tasks;
        setTasks((ts) => ts.map((t, i) => (saved[i] ? { ...t, id: saved[i].id } : t)));
      }
      router.refresh();
    });
  }

  const taskCount = tasks.length;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-6">
        <Panel title="Dados do plano">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do plano" htmlFor="name" required error={errors.name} className="sm:col-span-2">
              <Input
                id="name"
                name="name"
                defaultValue={initial.name}
                placeholder="Ex.: Preventiva split residencial"
                className="h-9"
                maxLength={120}
                aria-invalid={errors.name ? true : undefined}
              />
            </Field>
            <Field
              label="Tipo de equipamento"
              htmlFor="equipmentTypeId"
              hint="Sugerido ao incluir equipamentos deste tipo em um contrato."
            >
              <select id="equipmentTypeId" name="equipmentTypeId" defaultValue={initial.equipmentTypeId} className={nativeSelectClass}>
                <option value="">Qualquer tipo</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Duração estimada da visita"
              htmlFor="estimatedMinutes"
              hint="Em minutos, por equipamento."
              error={errors.estimatedMinutes}
            >
              <div className="relative">
                <Input
                  id="estimatedMinutes"
                  name="estimatedMinutes"
                  type="number"
                  min={10}
                  max={1440}
                  step={5}
                  defaultValue={initial.estimatedMinutes}
                  className="h-9 pr-12 tabular-nums"
                  aria-invalid={errors.estimatedMinutes ? true : undefined}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-steel">min</span>
              </div>
            </Field>
            <Field
              label="Valor de referência da visita"
              htmlFor="visitReferenceValue"
              hint="Base da comissão do técnico nas OMs geradas por contrato."
              error={errors.visitReferenceValue}
            >
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-steel">R$</span>
                <MaskedInput
                  id="visitReferenceValue"
                  name="visitReferenceValue"
                  mask="money"
                  defaultValue={initial.visitReferenceValue}
                  placeholder="0,00"
                  className="h-9 pl-9 tabular-nums"
                />
              </div>
            </Field>
            <div className="flex items-start gap-3 rounded-xl border border-rime bg-night/40 p-3">
              <Switch id="isPmoc" name="isPmoc" checked={isPmoc} onCheckedChange={setIsPmoc} className="mt-0.5" />
              <label htmlFor="isPmoc" className="min-w-0">
                <span className="block text-sm font-medium text-silver">Atende o PMOC</span>
                <span className="block text-xs text-steel">
                  As OMs saem como PMOC e entram no relatório da Lei 13.589/2018.
                </span>
              </label>
            </div>
            <Field label="Descrição" htmlFor="description" className="sm:col-span-2" error={errors.description}>
              <Textarea
                id="description"
                name="description"
                defaultValue={initial.description}
                placeholder="Para que equipamentos e clientes este plano serve"
                rows={2}
                maxLength={600}
              />
            </Field>
          </div>
        </Panel>

        <Panel
          title="Tarefas da visita"
          description="Cada tarefa vira um item do checklist da OM. A visita acontece na menor frequência entre as tarefas e inclui as que vencem naquele mês."
          actions={<span className="text-xs tabular-nums text-steel">{plural(taskCount, "tarefa", "tarefas")}</span>}
        >
          <TaskEditor
            tasks={tasks}
            interval={interval}
            errors={errors}
            focusKey={focusKey}
            onChange={patchTask}
            onMove={moveTask}
            onRemove={removeTask}
            onAdd={addTask}
          />
        </Panel>

        <Panel
          title="Materiais por visita"
          description="Consumo previsto em cada visita, por equipamento. Entra na previsão de compras do estoque."
        >
          <MaterialsEditor
            materials={materials}
            products={products}
            visitsPerYear={visitsPerYear}
            errors={materialErrors}
            focusKey={focusKey}
            onChange={(key, patch) => setMaterials((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)))}
            onRemove={(key) => setMaterials((ms) => ms.filter((m) => m.key !== key))}
            onAdd={addMaterial}
          />
        </Panel>
      </div>

      <aside className="min-w-0 space-y-6 xl:sticky xl:top-24 xl:self-start">
        <PlanPreview tasks={tasks} today={today} />
        {aside}
      </aside>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-rime bg-abyss/85 px-4 py-3 backdrop-blur-xl md:-mx-8 md:px-8 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-steel">
            <span className="text-silver">{plural(taskCount, "tarefa", "tarefas")}</span>
            {taskCount > 0 && <>, {intervalLabel(interval).toLowerCase()}</>}
            {materials.length > 0 && <>, {plural(materials.length, "material", "materiais")} por visita</>}
          </p>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="h-9">
              <Link href="/admin/planos">{planId ? "Voltar aos planos" : "Cancelar"}</Link>
            </Button>
            <Button type="submit" className="h-9 px-4" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {planId ? "Salvar plano" : "Criar plano"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
