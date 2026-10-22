"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const SHARDS = 12;

/**
 * Explosão de gelo: cristais que se espalham a partir do centro e um anel de geada.
 * Dispare mudando `burstKey` (ex.: ao concluir uma OM ou confirmar um pagamento).
 */
export function FrostBurst({ burstKey, size = 220 }: { burstKey: number; size?: number }) {
  const reduce = useReducedMotion();
  if (!burstKey || reduce) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ width: size, height: size }}
    >
      <AnimatePresence>
        <motion.span key={burstKey} className="absolute inset-0">
          <motion.span
            className="absolute inset-0 rounded-full border border-frost/70"
            initial={{ scale: 0.15, opacity: 0.9 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            style={{ boxShadow: "0 0 24px var(--glow-ice) inset" }}
          />
          {Array.from({ length: SHARDS }).map((_, i) => {
            const angle = (i / SHARDS) * Math.PI * 2;
            const dist = size * (0.32 + (i % 3) * 0.06);
            return (
              <motion.span
                key={i}
                className="absolute left-1/2 top-1/2 text-frost"
                initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
                animate={{
                  x: Math.cos(angle) * dist,
                  y: Math.sin(angle) * dist,
                  opacity: 0,
                  scale: 1,
                  rotate: 120,
                }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: (i % 4) * 0.02 }}
              >
                <IceCrystalIcon className="-ml-1.5 -mt-1.5 size-3 drop-shadow-[0_0_6px_var(--glow-ice)]" />
              </motion.span>
            );
          })}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function IceCrystalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className}>
      {[0, 60, 120].map((r) => (
        <g key={r} transform={`rotate(${r} 12 12)`}>
          <path d="M12 2v20" />
          <path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
        </g>
      ))}
    </svg>
  );
}
