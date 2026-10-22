"use client";

import { useActionState, useState } from "react";
import { motion } from "motion/react";
import { Snowflake } from "lucide-react";
import { SubmitButton, useActionToast } from "@/components/system/form";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { cn } from "@/lib/utils";
import { rateWorkOrderAction } from "../atendimentos/actions";
import { RATING_LABELS } from "../_lib/copy";

/** Avaliação do atendimento: 1 a 5 flocos + comentário opcional (uma vez só). */
export function RatingForm({ workOrderId }: { workOrderId: string }) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const [state, formAction] = useActionState(rateWorkOrderAction, initialActionState);
  useActionToast(state, { success: "Avaliação enviada" });
  const shown = hover || value;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={workOrderId} />
      <input type="hidden" name="rating" value={value || ""} />
      <div>
        <div
          role="radiogroup"
          aria-label="Nota do atendimento"
          className="flex items-center gap-1.5"
          onPointerLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const on = n <= shown;
            return (
              <motion.button
                key={n}
                type="button"
                role="radio"
                aria-checked={value === n}
                aria-label={`${n} de 5: ${RATING_LABELS[n]}`}
                onClick={() => setValue(n)}
                onPointerEnter={(e) => e.pointerType === "mouse" && setHover(n)}
                whileTap={{ scale: 0.82 }}
                animate={on ? { scale: 1.08, rotate: 60 } : { scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 16, delay: value === n && !hover ? 0 : (n - 1) * 0.025 }}
                className={cn(
                  "grid size-11 place-items-center rounded-full transition-colors",
                  on
                    ? "text-ice drop-shadow-[0_0_10px_color-mix(in_srgb,var(--ice)_65%,transparent)] light:drop-shadow-[0_0_5px_var(--glow-ice)]"
                    : "text-steel/45 hover:text-steel light:text-steel/65 light:hover:text-steel",
                )}
              >
                <Snowflake className="size-7" strokeWidth={on ? 2.2 : 1.6} />
              </motion.button>
            );
          })}
        </div>
        <p className={cn("mt-1.5 h-5 text-sm", shown ? "text-frost" : "text-steel")}>
          {shown ? RATING_LABELS[shown] : "Toque em um floco para dar sua nota"}
        </p>
        {state.fieldErrors?.rating && <p className="text-xs text-gauge-red">{state.fieldErrors.rating}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="rating-comment" className="text-sm font-medium text-silver">
          Comentário <span className="font-normal text-steel">(opcional)</span>
        </label>
        <Textarea
          id="rating-comment"
          name="comment"
          maxLength={1000}
          rows={3}
          placeholder="Conte como foi a visita, o que podemos melhorar…"
        />
      </div>
      {state.ok === false && state.error && !state.fieldErrors && (
        <p role="alert" className="text-sm text-gauge-red">
          {state.error}
        </p>
      )}
      <SubmitButton size="lg" className="h-11 w-full sm:w-auto sm:px-5" disabled={!value}>
        Enviar avaliação
      </SubmitButton>
    </form>
  );
}

/** Nota já dada (somente leitura). */
export function RatingDisplay({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`Nota ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Snowflake
          key={n}
          aria-hidden
          className={cn(
            "size-4",
            // no claro o brilho borra o floco pequeno: fica só o traço nítido
            n <= value ? "text-ice drop-shadow-[0_0_6px_color-mix(in_srgb,var(--ice)_50%,transparent)] light:drop-shadow-none" : "text-steel/30",
          )}
        />
      ))}
    </span>
  );
}
