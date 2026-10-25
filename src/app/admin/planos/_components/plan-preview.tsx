"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Panel } from "@/components/system/panel";
import { weekday } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { periodLabel, planPreview, plural } from "../_lib/preview";
import { MonthStrip } from "./month-strip";
import type { DraftTask } from "./types";
import { DateField } from "@/components/system/fields";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function PlanPreview({ tasks, today }: { tasks: DraftTask[]; today: string }) {
  const [anchor, setAnchor] = useState(today);
  const validAnchor = /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : today;
  const indexed = useMemo(
    () => tasks.map((t, position) => ({ ...t, position, title: t.title.trim() || `Tarefa ${position + 1}` })),
    [tasks],
  );
  const preview = useMemo(() => planPreview(indexed, validAnchor, 12), [indexed, validAnchor]);
  const total = indexed.length;

  return (
    <Panel
      title="Prévia de 12 meses"
      description="Como as OMs deste plano serão montadas a partir de uma primeira visita de exemplo."
    >
      <label className="flex flex-wrap items-center justify-between gap-2 text-sm text-steel">
        Primeira visita
        <DateField
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
          className="h-9 w-40"
          aria-label="Data da primeira visita (exemplo)"
        />
      </label>

      {total === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-rime-strong px-4 py-6 text-center text-sm text-steel">
          Adicione tarefas para ver quando cada visita acontece.
        </p>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-3 divide-x divide-rime rounded-xl bg-night/60 ring-1 ring-rime">
            <div className="px-3 py-2.5">
              <dt className="text-[0.72rem] text-steel">Visitas</dt>
              <dd className="readout text-sm font-semibold text-silver">{periodLabel(preview.interval)}</dd>
            </div>
            <div className="px-3 py-2.5">
              <dt className="text-[0.72rem] text-steel">Em 12 meses</dt>
              <dd className="readout text-sm font-semibold text-silver">{plural(preview.visits.length, "visita", "visitas")}</dd>
            </div>
            <div className="px-3 py-2.5">
              <dt className="text-[0.72rem] text-steel">Tarefas no ano</dt>
              <dd className="readout text-sm font-semibold text-silver">{preview.executions}</dd>
            </div>
          </dl>

          <MonthStrip
            className="mt-5"
            max={total}
            cells={preview.cells.map((c) => ({
              month: c.month,
              value: c.visit?.tasks.length ?? 0,
              emphasis: c.visit?.tasks.length === total,
              title: c.visit
                ? `${formatDate(c.visit.date)}: ${plural(c.visit.tasks.length, "tarefa", "tarefas")}`
                : "Sem visita neste mês",
            }))}
          />
          <p className="mt-2 text-xs text-steel">Altura da barra: quantas tarefas entram na visita do mês.</p>

          <ol className="mt-5 space-y-2">
            <AnimatePresence initial={false}>
              {preview.visits.map((v, i) => {
                const full = v.tasks.length === total;
                return (
                  <motion.li
                    key={v.date}
                    layout="position"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="rounded-lg border border-rime bg-night/40 px-3 py-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm text-silver">
                        <span className="tabular-nums">{formatDate(v.date)}</span>
                        <span className="ml-1.5 text-xs text-steel">{WEEKDAYS[weekday(v.date)]}</span>
                        {i === 0 && <span className="ml-2 text-xs text-ice">primeira</span>}
                      </p>
                      <span className={cn("shrink-0 text-xs tabular-nums", full ? "text-frost" : "text-steel")}>
                        {full ? "Visita completa" : `${v.tasks.length} de ${total} tarefas`}
                      </span>
                    </div>
                    {!full && (
                      <p className="mt-1 line-clamp-2 text-xs text-steel">{v.tasks.map((t) => t.title).join("; ")}</p>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
          <p className="mt-3 text-xs text-steel">
            Datas previstas. Na geração, domingos (e sábados, se a empresa não atende) passam para o dia útil anterior.
          </p>
        </>
      )}
    </Panel>
  );
}
