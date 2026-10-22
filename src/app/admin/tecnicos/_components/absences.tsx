"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarOff, CircleAlert, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ConfirmAction } from "@/components/system/confirm-action";
import { Field, useActionToast } from "@/components/system/form";
import { ToneBadge } from "@/components/system/tone-badge";
import { diffDays } from "@/lib/dates";
import { formatDate, formatDayMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addAbsence, deleteAbsence } from "../actions";
import { FormError, PendingButton, useFormAction } from "./form-kit";

export type AbsenceItem = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  scheduledInside: number;
};

const REASONS = ["Férias", "Folga", "Atestado médico", "Treinamento", "Licença"];

export function Absences({
  technicianId,
  absences,
  today,
}: {
  technicianId: string;
  absences: AbsenceItem[];
  today: string;
}) {
  const action = useMemo(() => addAbsence.bind(null, technicianId), [technicianId]);
  const { state, onSubmit, pending } = useFormAction(action);
  const formRef = useRef<HTMLFormElement>(null);
  useActionToast(state, { onSuccess: () => formRef.current?.reset() });
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <div>
      <p className="text-xs leading-relaxed text-steel">
        Nesses dias o gerador automático não atribui OMs a este técnico: elas ficam sem técnico para você distribuir.
        OMs já agendadas não mudam sozinhas.
      </p>

      {absences.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-rime px-3 py-3 text-sm text-steel">
          <CalendarOff className="size-4 shrink-0 text-frost/70" />
          Nenhuma folga, férias ou afastamento registrado.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          <AnimatePresence initial={false}>
            {absences.map((a) => {
              const phase = a.endDate < today ? "past" : a.startDate > today ? "next" : "now";
              const days = diffDays(a.startDate, a.endDate) + 1;
              return (
                <motion.li
                  key={a.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div
                    className={cn(
                      "flex items-start gap-3 rounded-lg px-3 py-2.5 ring-1 ring-rime",
                      phase === "past" ? "bg-transparent" : "bg-night/60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("text-sm tabular-nums", phase === "past" ? "text-steel" : "text-silver")}>
                          {a.startDate === a.endDate
                            ? formatDate(a.startDate)
                            : `${formatDayMonth(a.startDate)} a ${formatDate(a.endDate)}`}
                        </span>
                        {phase === "now" && <ToneBadge tone="ice" live>Em andamento</ToneBadge>}
                        {phase === "next" && <ToneBadge tone="violet">Próxima</ToneBadge>}
                        {phase === "past" && <ToneBadge tone="steel">Encerrada</ToneBadge>}
                      </div>
                      <p className="mt-0.5 text-xs text-steel">
                        {a.reason ?? "Sem motivo informado"}
                        <span className="text-steel/70 light:text-steel">
                          {" "}
                          ({days} {days > 1 ? "dias" : "dia"})
                        </span>
                      </p>
                      {phase !== "past" && a.scheduledInside > 0 && (
                        <Link
                          href="/admin/agenda"
                          className="mt-1.5 inline-flex items-center gap-1 text-xs text-brass hover:underline"
                        >
                          <CircleAlert className="size-3.5" />
                          {a.scheduledInside} OM{a.scheduledInside > 1 ? "s" : ""} agendada
                          {a.scheduledInside > 1 ? "s" : ""} nesses dias: reatribua na agenda
                        </Link>
                      )}
                    </div>
                    <ConfirmAction
                      action={deleteAbsence.bind(null, a.id)}
                      title="Remover esta ausência?"
                      description="O técnico volta a receber OMs automáticas nesses dias."
                      confirmLabel="Remover ausência"
                      destructive
                      variant="ghost"
                      size="icon-sm"
                      className="text-steel hover:text-gauge-red"
                    >
                      <Trash2 />
                      <span className="sr-only">Remover ausência</span>
                    </ConfirmAction>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <form ref={formRef} onSubmit={onSubmit} className="mt-5 space-y-3 border-t border-rime pt-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início" htmlFor="abs-start" required error={err("startDate")}>
            <Input id="abs-start" name="startDate" type="date" />
          </Field>
          <Field label="Fim" htmlFor="abs-end" required error={err("endDate")}>
            <Input id="abs-end" name="endDate" type="date" />
          </Field>
        </div>
        <Field label="Motivo" htmlFor="abs-reason" error={err("reason")}>
          <Input id="abs-reason" name="reason" list="abs-reasons" placeholder="Férias, folga, atestado…" maxLength={200} />
          <datalist id="abs-reasons">
            {REASONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <FormError state={state} />
        <div className="flex justify-end">
          <PendingButton pending={pending} variant="outline">
            Registrar ausência
          </PendingButton>
        </div>
      </form>
    </div>
  );
}
