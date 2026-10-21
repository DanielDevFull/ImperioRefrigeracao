"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Camera, Gauge, ListPlus, Trash2 } from "lucide-react";
import { nativeSelectClass } from "@/components/system/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { frequencyMonths as frequencyLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { effectiveFrequency, FREQUENCY_OPTIONS, frequencyText, UNIT_SUGGESTIONS } from "../_lib/preview";
import type { DraftTask } from "./types";

const spring = { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.8 };

export function TaskEditor({
  tasks,
  interval,
  errors,
  focusKey,
  onChange,
  onMove,
  onRemove,
  onAdd,
}: {
  tasks: DraftTask[];
  interval: number;
  errors: Record<string, string>;
  focusKey: string | null;
  onChange: (key: string, patch: Partial<DraftTask>) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <datalist id="plan-unit-suggestions">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      {tasks.length === 0 && (
        <div className="rounded-xl border border-dashed border-rime-strong px-4 py-8 text-center">
          <p className="text-sm text-silver">Nenhuma tarefa ainda</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-steel">
            Cada tarefa vira um item do checklist da OM. Comece pela limpeza dos filtros, por exemplo.
          </p>
        </div>
      )}

      <ol className="space-y-3">
        <AnimatePresence initial={false} mode="popLayout">
          {tasks.map((t, i) => {
            const eff = effectiveFrequency(interval, t.frequencyMonths);
            const titleError = errors[`tasks.${i}.title`];
            const freqError = errors[`tasks.${i}.frequencyMonths`];
            const unitError = errors[`tasks.${i}.measurementUnit`];
            return (
              <motion.li
                key={t.key}
                layout="position"
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: -28, scale: 0.97, transition: { duration: 0.18 } }}
                transition={spring}
                className={cn(
                  "rounded-xl border bg-night/55 p-3 sm:p-4",
                  titleError ? "border-gauge-red/40" : "border-rime",
                )}
              >
                <div className="flex items-start gap-3">
                  <motion.span
                    layout="position"
                    className="mt-1.5 grid size-6 shrink-0 place-items-center rounded-full bg-ice/10 text-xs font-semibold tabular-nums text-ice ring-1 ring-ice/25"
                    aria-hidden
                  >
                    {i + 1}
                  </motion.span>

                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="min-w-0 flex-1">
                        <Input
                          value={t.title}
                          onChange={(e) => onChange(t.key, { title: e.target.value })}
                          placeholder="Ex.: Limpeza dos filtros de ar"
                          aria-label={`Título da tarefa ${i + 1}`}
                          aria-invalid={titleError ? true : undefined}
                          autoFocus={t.key === focusKey}
                          className="h-9"
                          maxLength={160}
                        />
                        {titleError && <p className="mt-1 text-xs text-gauge-red">{titleError}</p>}
                      </div>
                      <div className="sm:w-40">
                        <select
                          value={t.frequencyMonths}
                          onChange={(e) => onChange(t.key, { frequencyMonths: Number(e.target.value) })}
                          className={nativeSelectClass}
                          aria-label={`Frequência da tarefa ${i + 1}`}
                        >
                          {FREQUENCY_OPTIONS.map((f) => (
                            <option key={f} value={f}>
                              {frequencyLabels[f]}
                            </option>
                          ))}
                        </select>
                        {freqError && <p className="mt-1 text-xs text-gauge-red">{freqError}</p>}
                      </div>
                    </div>

                    <Textarea
                      value={t.instructions}
                      onChange={(e) => onChange(t.key, { instructions: e.target.value })}
                      placeholder="Instruções para o técnico (opcional)"
                      aria-label={`Instruções da tarefa ${i + 1}`}
                      rows={1}
                      className="min-h-9 py-1.5"
                      maxLength={2000}
                    />

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5">
                      <label className="flex items-center gap-2 text-sm text-steel">
                        <Gauge className="size-4 text-steel/80" aria-hidden />
                        Medição
                        <Input
                          list="plan-unit-suggestions"
                          value={t.measurementUnit}
                          onChange={(e) => onChange(t.key, { measurementUnit: e.target.value })}
                          placeholder="Nenhuma"
                          aria-label={`Unidade de medição da tarefa ${i + 1}`}
                          className="h-8 w-28"
                          maxLength={12}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-steel">
                        <Switch
                          checked={t.requiresPhoto}
                          onCheckedChange={(v) => onChange(t.key, { requiresPhoto: v })}
                          aria-label={`Exige foto na tarefa ${i + 1}`}
                        />
                        <Camera className="size-4 text-steel/80" aria-hidden />
                        Exige foto
                      </label>
                      {unitError && <p className="text-xs text-gauge-red">{unitError}</p>}
                    </div>

                    {eff !== t.frequencyMonths && (
                      <p className="text-xs text-brass">
                        Na prática esta tarefa cai {frequencyText(eff)}: as visitas acontecem {frequencyText(interval)} e
                        ela só entra quando o ciclo das duas coincide.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onMove(t.key, -1)}
                      disabled={i === 0}
                      aria-label={`Subir tarefa ${i + 1}`}
                      className="text-steel hover:text-frost"
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onMove(t.key, 1)}
                      disabled={i === tasks.length - 1}
                      aria-label={`Descer tarefa ${i + 1}`}
                      className="text-steel hover:text-frost"
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemove(t.key)}
                      aria-label={`Remover tarefa ${i + 1}`}
                      className="text-steel hover:bg-gauge-red/10 hover:text-gauge-red"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      {errors.tasks && <p className="mt-3 text-sm text-gauge-red">{errors.tasks}</p>}

      <Button type="button" variant="outline" onClick={onAdd} className="mt-4 h-9">
        <ListPlus />
        Adicionar tarefa
      </Button>
    </div>
  );
}
