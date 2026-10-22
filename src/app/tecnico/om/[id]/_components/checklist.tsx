"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Camera, ChevronDown, CloudUpload, Lock, NotebookPen, Ruler } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toneOnTint } from "@/components/system/tone-badge";
import { cn } from "@/lib/utils";
import type { ExecTask } from "../_lib/types";

export type TaskPatch = Partial<Pick<ExecTask, "done" | "measurementValue" | "notes">>;

const PRESSURE = /^(psi|bar|kpa|mpa)$/i;

/** "Pressão de sucção e descarga" (psi) → dois campos: Sucção / Descarga. */
function dualLabels(task: ExecTask): [string, string] | null {
  if (!task.measurementUnit || !PRESSURE.test(task.measurementUnit.trim())) return null;
  const m = /(\p{L}+) e (\p{L}+)\s*$/u.exec(task.title);
  if (!m) return null;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return [cap(m[1]), cap(m[2])];
}

function normalize(v: string) {
  return v.replace(/\s+/g, " ").trim().replace(/(\d)\.(\d)/g, "$1,$2");
}

function MeasureField({
  task,
  disabled,
  invalid,
  onCommit,
  inputRef,
}: {
  task: ExecTask;
  disabled: boolean;
  invalid: boolean;
  onCommit: (value: string | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const dual = dualLabels(task);
  const server = task.measurementValue ?? "";
  const split = (v: string) => {
    const [a = "", b = ""] = v.split("/").map((s) => s.trim());
    return [a, b] as [string, string];
  };
  const [values, setValues] = useState<[string, string]>(() => (dual ? split(server) : [server, ""]));
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(server);
  if (!focused && seen !== server) {
    setSeen(server);
    setValues(dual ? split(server) : [server, ""]);
  }
  const combined = () => {
    if (!dual) return normalize(values[0]) || null;
    const a = normalize(values[0]);
    const b = normalize(values[1]);
    return a || b ? `${a || "—"} / ${b || "—"}` : null;
  };
  const commit = () => {
    setFocused(false);
    const v = combined();
    if ((v ?? "") !== (task.measurementValue ?? "")) onCommit(v);
  };
  const unit = task.measurementUnit!;
  const fields = dual ? dual : [null];
  return (
    <div className={cn("mt-3 grid gap-2", dual && "grid-cols-2")}>
      {fields.map((label, i) => (
        <label key={i} className="block">
          {label && <span className="mb-1 block text-xs text-steel">{label}</span>}
          <span
            className={cn(
              "flex h-12 items-center rounded-xl bg-abyss/50 ring-1 transition-shadow focus-within:ring-2 focus-within:ring-ice",
              invalid ? "ring-gauge-red/60" : "ring-steel/30",
              disabled && "opacity-50",
            )}
          >
            <input
              ref={i === 0 ? inputRef : undefined}
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              disabled={disabled}
              value={values[i]}
              placeholder={label ? "0" : "Medição"}
              aria-label={`${task.title}${label ? ` — ${label}` : ""} (${unit})`}
              onFocus={() => setFocused(true)}
              onChange={(e) => {
                const next: [string, string] = [...values];
                next[i] = e.target.value.replace(/[^\d.,\-\s]/g, "").slice(0, 12);
                setValues(next);
              }}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="readout h-full min-w-0 flex-1 bg-transparent px-3.5 text-lg font-semibold text-silver outline-none placeholder:text-base placeholder:font-normal placeholder:text-steel/60"
            />
            <span className="pr-3.5 text-sm font-medium text-steel">{unit}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function TaskRow({
  task,
  index,
  locked,
  pending,
  highlighted,
  hasPhoto,
  onSave,
  onPhoto,
}: {
  task: ExecTask;
  index: number;
  locked: boolean;
  pending: boolean;
  highlighted: boolean;
  hasPhoto: boolean;
  onSave: (task: ExecTask, patch: TaskPatch) => void;
  onPhoto: (taskId: string) => void;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(Boolean(task.notes));
  const [notes, setNotes] = useState(task.notes ?? "");
  const [notesFocused, setNotesFocused] = useState(false);
  const [seenNotes, setSeenNotes] = useState(task.notes);
  const [hint, setHint] = useState<string | null>(null);
  const measureRef = useRef<HTMLInputElement>(null);
  if (!notesFocused && seenNotes !== task.notes) {
    setSeenNotes(task.notes);
    setNotes(task.notes ?? "");
  }
  const missingMeasure = Boolean(task.measurementUnit) && !task.measurementValue?.trim();

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 4000);
    return () => clearTimeout(t);
  }, [hint]);

  function toggle() {
    if (locked) return;
    if (!task.done && missingMeasure) {
      setHint(`Informe a medição em ${task.measurementUnit} para marcar este item.`);
      measureRef.current?.focus();
      return;
    }
    onSave(task, { done: !task.done });
  }

  return (
    <li
      id={`task-${task.id}`}
      className={cn(
        "scroll-mt-28 rounded-2xl ring-1 transition-[box-shadow,background-color] duration-300",
        // claro: cartão branco sólido com sombra leve (o véu de 50% fica acinzentado na página gelo)
        highlighted
          ? "bg-gauge-red/[0.06] ring-2 ring-gauge-red/60"
          : cn("bg-night/50 light:bg-night light:shadow-[0_1px_2px_var(--shade)]", task.done ? "ring-mint/20 light:ring-mint/30" : "ring-rime"),
      )}
    >
      <div className="flex gap-3 p-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.title}
          disabled={locked}
          onClick={toggle}
          className={cn(
            "relative grid size-12 shrink-0 place-items-center rounded-xl ring-2 transition-colors",
            task.done ? "bg-mint text-abyss ring-mint" : "bg-abyss/40 text-transparent ring-steel/45 active:bg-ice/10 disabled:opacity-50",
          )}
        >
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              initial={false}
              animate={{ pathLength: task.done ? 1 : 0, opacity: task.done ? 1 : 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start gap-2">
            <p className={cn("flex-1 text-[0.98rem] font-medium leading-snug", task.done ? "text-steel" : "text-silver")}>
              <span className="readout mr-1.5 text-steel/70 light:text-steel">{index + 1}.</span>
              {task.title}
            </p>
            {pending && (
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[0.7rem] text-brass" title="Aguardando envio">
                <CloudUpload className="size-3.5" />
                <span className="sr-only">Aguardando envio</span>
              </span>
            )}
          </div>
          {(task.measurementUnit || task.requiresPhoto || task.instructions) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {task.measurementUnit && (
                <span className={cn("inline-flex items-center gap-1 rounded-full bg-ice/10 px-2 py-0.5 text-xs ring-1 ring-inset ring-ice/25", toneOnTint.ice)}>
                  <Ruler className="size-3" />
                  Medição em {task.measurementUnit}
                </span>
              )}
              {task.requiresPhoto && (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onPhoto(task.id)}
                  className={cn(
                    "-my-1.5 inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xs ring-1 ring-inset disabled:opacity-50",
                    hasPhoto ? cn("bg-mint/12 ring-mint/30", toneOnTint.mint) : cn("bg-brass/12 ring-brass/30 active:bg-brass/20", toneOnTint.brass),
                  )}
                >
                  <Camera className="size-3.5" />
                  {hasPhoto ? "Foto registrada" : "Exige foto"}
                </button>
              )}
              {task.instructions && (
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  aria-expanded={open}
                  className="-my-1.5 inline-flex h-9 items-center gap-1 rounded-full px-2 text-xs text-steel active:text-frost"
                >
                  Como fazer
                  <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                </button>
              )}
            </div>
          )}
          <AnimatePresence initial={false}>
            {open && task.instructions && (
              <motion.p
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden whitespace-pre-line text-sm leading-relaxed text-steel"
              >
                <span className="block pt-2">{task.instructions}</span>
              </motion.p>
            )}
          </AnimatePresence>
          {task.measurementUnit && (
            <MeasureField
              task={task}
              disabled={locked}
              invalid={highlighted && missingMeasure}
              inputRef={measureRef}
              onCommit={(v) => onSave(task, { measurementValue: v, done: v ? true : task.done })}
            />
          )}
          {hint && (
            <p role="alert" className="mt-2 text-sm text-brass">
              {hint}
            </p>
          )}
          {notesOpen ? (
            <Textarea
              value={notes}
              disabled={locked}
              placeholder="Observação deste item (opcional)"
              onFocus={() => setNotesFocused(true)}
              onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
              onBlur={() => {
                setNotesFocused(false);
                const v = notes.trim() || null;
                if (v !== (task.notes ?? null)) onSave(task, { notes: v });
              }}
              className="mt-3 min-h-20 rounded-xl bg-abyss/50 text-[0.95rem]"
            />
          ) : (
            !locked && (
              <button
                type="button"
                onClick={() => setNotesOpen(true)}
                className="-mb-1.5 mt-1 inline-flex h-10 items-center gap-1.5 text-sm text-steel active:text-frost"
              >
                <NotebookPen className="size-4" />
                Adicionar observação
              </button>
            )
          )}
        </div>
      </div>
    </li>
  );
}

export function Checklist({
  tasks,
  locked,
  lockedReason,
  pendingTaskIds,
  highlight,
  photoTaskIds,
  onSave,
  onPhoto,
}: {
  tasks: ExecTask[];
  locked: boolean;
  lockedReason: string | null;
  pendingTaskIds: Set<string>;
  highlight: Set<string>;
  photoTaskIds: Set<string>;
  onSave: (task: ExecTask, patch: TaskPatch) => void;
  onPhoto: (taskId: string) => void;
}) {
  if (!tasks.length) {
    return (
      <p className="rounded-2xl bg-night/50 px-4 py-5 text-sm text-steel ring-1 ring-rime">
        Esta OM não tem checklist. Registre o que foi feito na conclusão.
      </p>
    );
  }
  return (
    <div className="space-y-2.5">
      {locked && lockedReason && (
        <p className="flex items-center gap-2.5 rounded-2xl bg-glacier/60 px-4 py-3 text-sm text-frost ring-1 ring-ice/20">
          <Lock className="size-4 shrink-0 text-ice" />
          {lockedReason}
        </p>
      )}
      {/* claro: esmaece menos (no sol forte o técnico confere o checklist antes de começar) */}
      <ol className={cn("space-y-2.5", locked && lockedReason && "opacity-70 light:opacity-90")}>
        {tasks.map((t, i) => (
          <TaskRow
            key={t.id}
            task={t}
            index={i}
            locked={locked}
            pending={pendingTaskIds.has(t.id)}
            highlighted={highlight.has(t.id)}
            hasPhoto={photoTaskIds.has(t.id)}
            onSave={onSave}
            onPhoto={onPhoto}
          />
        ))}
      </ol>
    </div>
  );
}
