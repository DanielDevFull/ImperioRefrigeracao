"use client";

import { MotionConfig } from "motion/react";

/** Respeita "reduzir movimento" do sistema em todas as animações do Motion. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
