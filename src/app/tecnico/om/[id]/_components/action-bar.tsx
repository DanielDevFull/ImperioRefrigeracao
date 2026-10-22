"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCheck, ChevronRight, FileText, Loader2, MoreHorizontal, Navigation, Pause, Play, Sun } from "lucide-react";
import { AnimatedNumber } from "@/components/brand/animated-number";
import { cn } from "@/lib/utils";
import { primaryAction, type WorkOrderStatus } from "@/server/core/work-order-flow";

export type Primary =
  | { kind: "status"; to: WorkOrderStatus; label: string }
  | { kind: "conclude"; label: string }
  | { kind: "next"; label: string; href: string }
  | null;

/** Ação principal do estado (primaryAction), com o atalho "já estou no local" para OMs do mesmo endereço. */
export function primaryFor(status: string, atSite: boolean, nextId: string | null): Primary {
  if (status === "concluida") {
    return nextId ? { kind: "next", label: "Próxima OM", href: `/tecnico/om/${nextId}` } : { kind: "next", label: "Voltar para Hoje", href: "/tecnico" };
  }
  if (atSite && ["aberta", "agendada", "aguardando_material"].includes(status)) {
    return { kind: "status", to: "em_execucao", label: "Iniciar atendimento" };
  }
  const p = primaryAction(status as WorkOrderStatus);
  if (!p) return null;
  if (p.to === "concluida") return { kind: "conclude", label: p.label };
  return { kind: "status", to: p.to, label: p.label };
}

function PrimaryIcon({ primary: p }: { primary: NonNullable<Primary> }) {
  const cls = "size-5 shrink-0";
  if (p.kind === "conclude") return <CheckCheck className={cls} />;
  if (p.kind === "next") return p.href === "/tecnico" ? <Sun className={cls} /> : <ChevronRight className={cls} />;
  if (p.to === "em_deslocamento") return <Navigation className={cls} />;
  return <Play className={cls} />;
}

const PrimaryButton = forwardRef<
  HTMLButtonElement,
  { primary: NonNullable<Primary>; busy: boolean; onClick: () => void }
>(function PrimaryButton({ primary, busy, onClick }, ref) {
  const conclude = primary.kind === "conclude";
  return (
    <motion.button
      ref={ref}
      layout
      type="button"
      onClick={onClick}
      disabled={busy}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      className={cn(
        "relative flex h-14 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-2xl px-3.5 text-base font-semibold tracking-[-0.005em] text-abyss outline-offset-4 transition-[filter] active:brightness-110 disabled:opacity-80",
        conclude
          ? "bg-gradient-to-b from-mint to-[#22b98f] shadow-[0_10px_30px_-10px_rgb(62_224_181/0.65)]"
          : "bg-gradient-to-b from-ice to-ice-deep shadow-[0_10px_30px_-10px_rgb(56_168_255/0.75)]",
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={busy ? "busy" : primary.label}
          initial={{ y: 22, opacity: 0, filter: "blur(4px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: -22, opacity: 0, filter: "blur(4px)" }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="flex min-w-0 items-center gap-2.5"
        >
          {busy ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <PrimaryIcon primary={primary} />}
          <span className="truncate">{primary.label}</span>
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
});

export type SuccessInfo = { commission: number | null; commissionPending: boolean; nextId: string | null };

function SuccessCard({ info, reportHref, onClose }: { info: SuccessInfo; reportHref: string; onClose: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key="success"
      role="status"
      aria-live="assertive"
      initial={{ y: 40, opacity: 0, scale: 0.97 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 30, opacity: 0 }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 380, damping: 30, delay: 0.12 }}
      className="frost-edge rounded-3xl bg-gradient-to-b from-glacier to-night p-5 shadow-[0_-12px_48px_-12px_rgb(62_224_181/0.35),0_24px_48px_-20px_rgb(0_0_0/0.8)] ring-1 ring-mint/25"
    >
      <div className="flex items-center gap-4">
        <span className="relative grid size-14 shrink-0 place-items-center rounded-full bg-mint/15 ring-1 ring-mint/40">
          <svg viewBox="0 0 24 24" className="size-8 text-mint" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.42, delay: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="font-display text-silver-brushed text-[1.4rem] font-semibold leading-tight">OM concluída</p>
          {info.commission != null && info.commission > 0 ? (
            <p className="mt-1 text-sm text-steel">
              <AnimatedNumber value={info.commission} format="brl" duration={0.8} className="readout text-lg font-semibold text-mint" />{" "}
              de comissão{info.commissionPending ? " prevista" : ""}
            </p>
          ) : (
            <p className="mt-1 text-sm text-steel">O cliente já foi avisado. Bom trabalho.</p>
          )}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
        <Link
          href={reportHref}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium text-frost ring-1 ring-rime active:bg-ice/5"
        >
          <FileText className="size-4" />
          Relatório
        </Link>
        <Link
          href={info.nextId ? `/tecnico/om/${info.nextId}` : "/tecnico"}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-ice to-ice-deep text-[1.02rem] font-semibold text-abyss"
        >
          {info.nextId ? "Próxima OM" : "Voltar para Hoje"}
          <ChevronRight className="size-5" />
        </Link>
      </div>
      <button type="button" onClick={onClose} className="mt-1 h-11 w-full text-sm text-steel active:text-frost">
        Ver esta OM
      </button>
    </motion.div>
  );
}

/** Barra fixa no rodapé: UM botão grande pelo estado da OM + ações secundárias. */
export function ActionBar({
  status,
  primary,
  busy,
  primaryRef,
  onPrimary,
  onPause,
  onMore,
  showMore,
  reportHref,
  success,
  onCloseSuccess,
}: {
  status: string;
  primary: Primary;
  busy: boolean;
  primaryRef: React.Ref<HTMLButtonElement>;
  onPrimary: () => void;
  onPause: () => void;
  onMore: () => void;
  showMore: boolean;
  reportHref: string;
  success: SuccessInfo | null;
  onCloseSuccess: () => void;
}) {
  const canPause = status === "em_execucao";
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-t from-abyss via-abyss/90 to-transparent transition-[top] duration-300",
          success ? "-top-40" : "-top-8",
        )}
      />
      <AnimatePresence mode="wait" initial={false}>
        {success ? (
          <SuccessCard info={success} reportHref={reportHref} onClose={onCloseSuccess} />
        ) : (
          <motion.div
            key="bar"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="relative flex items-center gap-2"
          >
            {showMore && (
              <motion.button
                layout
                type="button"
                onClick={onMore}
                aria-label="Mais opções"
                className="grid size-14 shrink-0 place-items-center rounded-2xl bg-glacier text-silver ring-1 ring-rime active:bg-glacier-2"
              >
                <MoreHorizontal className="size-5" />
              </motion.button>
            )}
            {status === "concluida" && (
              <motion.div layout className="shrink-0">
                <Link
                  href={reportHref}
                  className="flex h-14 items-center gap-2 rounded-2xl bg-glacier px-4 text-sm font-medium text-silver ring-1 ring-rime active:bg-glacier-2"
                >
                  <FileText className="size-4 text-ice" />
                  Relatório
                </Link>
              </motion.div>
            )}
            <AnimatePresence initial={false}>
              {canPause && (
                <motion.button
                  key="pause"
                  layout
                  type="button"
                  onClick={onPause}
                  disabled={busy}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex h-14 shrink-0 items-center gap-1.5 rounded-2xl bg-glacier px-4 text-sm font-medium text-silver ring-1 ring-rime active:bg-glacier-2 disabled:opacity-60"
                >
                  <Pause className="size-4 text-brass" />
                  Pausar
                </motion.button>
              )}
            </AnimatePresence>
            {primary ? (
              <PrimaryButton ref={primaryRef} primary={primary} busy={busy} onClick={onPrimary} />
            ) : (
              <p className="flex h-14 flex-1 items-center justify-center rounded-2xl bg-night/80 px-4 text-sm text-steel ring-1 ring-rime">
                {status === "cancelada" ? "OM cancelada pelo escritório" : "Nenhuma ação disponível"}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
