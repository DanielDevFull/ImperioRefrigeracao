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
        className="grid size-20 place-items-center rounded-full bg-gradient-to-br from-mint/25 to-ice/15 text-mint ring-1 ring-mint/35 shadow-[0_0_40px_rgb(62_224_181/0.25)]"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
      >
        <Check className="size-9" strokeWidth={2.4} />
      </motion.span>
    </div>
  );
}
