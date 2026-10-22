"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";

/** Selo de confirmação do chamado (anima uma vez ao chegar na tela). */
export function SuccessMark() {
  return (
    <div className="relative mx-auto grid size-20 place-items-center">
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full border border-frost/60"
        initial={{ scale: 0.4, opacity: 0.9 }}
        animate={{ scale: 1.6, opacity: 0 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.span
        className={
          "grid size-20 place-items-center rounded-full bg-gradient-to-br from-mint/25 to-ice/15 text-mint ring-1 ring-mint/35 shadow-[0_0_40px_color-mix(in_srgb,var(--mint)_25%,transparent)] " +
          // no claro: disco de menta clara (não acinzentado) com halo leve e sombra azul-marinho
          "light:bg-night light:from-mint/14 light:to-ice/8 light:ring-mint/30 light:shadow-[0_0_0_6px_var(--haze-mint),0_16px_32px_-16px_var(--glow-mint)]"
        }
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
      >
        <Check className="size-9" strokeWidth={2.4} />
      </motion.span>
    </div>
  );
}
