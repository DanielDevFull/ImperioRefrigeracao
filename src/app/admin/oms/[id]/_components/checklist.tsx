"use client";

import { startTransition, useOptimistic, useState } from "react";
import { Camera, Gauge, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveTaskAction } from "../../actions";

export type TaskItem = {
  id: string;
  title: string;
  instructions: string | null;
  measurementUnit: string | null;
  measurementValue: string | null;
  requiresPhoto: boolean;
  done: boolean;
  notes: string | null;
  doneAt: string | null;
};

type Patch = { id: string; done?: boolean; measurementValue?: string | null; notes?: string | null };

function TaskRow({ task, editable, onSave }: { task: TaskItem; editable: boolean; onSave: (p: Patch) => void }) {
  const [measure, setMeasure] = useState(task.measurementValue ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [showNotes, setShowNotes] = useState(Boolean(task.notes));
  return (
    <li className={cn("px-5 py-3.5 transition-colors", task.done && "bg-mint/[0.03]")}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`task-${task.id}`}
          className="mt-0.5"
          checked={task.done}
          disabled={!editable}
          onCheckedChange={(v) => onSave({ id: task.id, done: v === true, measurementValue: measure || null })}
          aria-label={task.done ? `Desmarcar ${task.title}` : `Marcar ${task.title} como feito`}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={`task-${task.id}`} className="text-sm text-silver">
            {task.title}
            {task.done && <span className="sr-only"> (concluído)</span>}
          </label>
          {task.instructions && <p className="mt-0.5 text-xs text-steel">{task.instructions}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel">
            {task.requiresPhoto && (
              <span className="inline-flex items-center gap-1">
                <Camera className="size-3.5" />
                Exige foto
              </span>
            )}
            {task.done && task.doneAt && <span className="text-mint">Feito em {formatDateTime(task.doneAt)}</span>}
            {editable && !showNotes && (
              <button type="button" className="inline-flex items-center gap-1 hover:text-frost" onClick={() => setShowNotes(true)}>
                <MessageSquareText className="size-3.5" />
                Adicionar observação
              </button>
            )}
          </div>
          {showNotes && (
            editable ? (
              <Textarea
                className="mt-2 min-h-12 text-sm"
                rows={2}
                value={notes}
                maxLength={1000}
                placeholder="Observação sobre este item"
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  if ((task.notes ?? "") !== notes) onSave({ id: task.id, notes: notes || null, done: task.done });
                }}
              />
            ) : (
              task.notes && <p className="mt-1.5 rounded-md bg-night/60 px-2.5 py-1.5 text-xs text-silver">{task.notes}</p>
            )
          )}
        </div>
        {task.measurementUnit && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Gauge className="hidden size-4 text-steel sm:block" />
            {editable ? (
              <Input
                aria-label={`Medição de ${task.title} em ${task.measurementUnit}`}
                className={cn("h-8 w-20 text-right tabular-nums", !measure && !task.done && "border-brass/40")}
                value={measure}
                inputMode="decimal"
                maxLength={20}
                onChange={(e) => setMeasure(e.target.value)}
                onBlur={() => {
                  if ((task.measurementValue ?? "") !== measure) onSave({ id: task.id, measurementValue: measure || null, done: task.done });
                }}
              />
            ) : (
              <span className={cn("readout text-sm", task.measurementValue ? "text-silver" : "text-steel")}>{task.measurementValue || "—"}</span>
            )}
            <span className="w-10 text-xs text-steel">{task.measurementUnit}</span>
          </div>
        )}
      </div>
    </li>
  );
}

export function Checklist({ tasks, editable, lockedReason }: { tasks: TaskItem[]; editable: boolean; lockedReason: string | null }) {
  const [items, apply] = useOptimistic(tasks, (cur: TaskItem[], p: Patch) =>
    cur.map((t) => (t.id === p.id ? { ...t, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } : t)),
  );

  const save = (p: Patch) =>
    startTransition(async () => {
      apply(p);
      const r = await saveTaskAction({ taskId: p.id, done: p.done ?? false, measurementValue: p.measurementValue, notes: p.notes });
      if (!r.ok) toast.error(r.error ?? "Não foi possível salvar o item.");
    });

  if (!tasks.length) {
    return (
      <p className="px-5 py-4 text-sm text-steel">
        Esta OM não tem checklist. O checklist vem do plano de manutenção; OMs avulsas registram o serviço no diagnóstico e na solução.
      </p>
    );
  }

  const done = items.filter((t) => t.done).length;
  const pct = Math.round((done / items.length) * 100);
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-rime px-5 py-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-night ring-1 ring-rime">
          <div className={cn("h-full rounded-full transition-[width] duration-500", pct === 100 ? "bg-mint" : "bg-ice")} style={{ width: `${pct}%` }} />
        </div>
        <span className="readout text-sm text-silver">
          {done} de {items.length}
        </span>
      </div>
      {lockedReason && <p className="border-b border-rime bg-night/40 px-5 py-2.5 text-xs text-steel">{lockedReason}</p>}
      <ul className="divide-y divide-rime/70">
        {items.map((t) => (
          <TaskRow key={t.id} task={t} editable={editable} onSave={save} />
        ))}
      </ul>
    </div>
  );
}
