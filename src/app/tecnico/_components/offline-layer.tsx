"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, CloudOff, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { onOutboxEvent, useOutbox } from "@/lib/offline/outbox";
import { cn } from "@/lib/utils";
import "../_lib/outbox-handlers";

const plural = (n: number) => (n === 1 ? "1 alteração" : `${n} alterações`);

/**
 * Faixa discreta de conexão + sincronização da fila offline.
 * Fica no layout do app: a fila é reenviada em qualquer tela do técnico.
 */
export function OfflineLayer() {
  const { online, pending, flushing, stalled, authRequired, ready, flush } = useOutbox();
  const pathname = usePathname();

  // Erros de itens reenviados em segundo plano (ninguém na tela esperando a resposta)
  useEffect(
    () =>
      onOutboxEvent((e) => {
        if (e.type === "failed" && !e.awaited) {
          toast.error("Uma alteração guardada não foi aceita", { description: e.result.error });
        }
      }),
    [],
  );

  // Com internet boa, o envio é instantâneo: só mostra "Enviando…" se demorar mais de 1,2 s
  const hasPending = pending > 0;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!hasPending) return;
    const t = setTimeout(() => setSlow(true), 1200);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [hasPending]);

  // "Tudo enviado" só depois de um acúmulo real (sem sinal, sinal fraco ou envio demorado)
  const troubled = hasPending && (!online || stalled || authRequired || slow);
  const [backlog, setBacklog] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  if (troubled && !backlog) setBacklog(true);
  if (backlog && !hasPending && online) {
    setBacklog(false);
    setJustSynced(true);
  }
  useEffect(() => {
    if (!justSynced) return;
    const t = setTimeout(() => setJustSynced(false), 2500);
    return () => clearTimeout(t);
  }, [justSynced]);

  let banner: { tone: "off" | "sync" | "warn" | "ok"; icon: React.ReactNode; text: string; action?: React.ReactNode } | null = null;
  if (!ready) banner = null;
  else if (!online) {
    banner = {
      tone: "off",
      icon: <WifiOff className="size-4" />,
      text: pending
        ? `Sem conexão — ${plural(pending)} ${pending === 1 ? "será enviada" : "serão enviadas"} quando a internet voltar`
        : "Sem conexão — o que você registrar fica guardado no aparelho",
    };
  } else if (authRequired && pending) {
    banner = {
      tone: "warn",
      icon: <CloudOff className="size-4" />,
      text: `Entre novamente para enviar ${plural(pending)}`,
      action: (
        <Link href={`/login?voltar=${encodeURIComponent(pathname)}`} className="font-semibold underline underline-offset-2">
          Entrar
        </Link>
      ),
    };
  } else if (stalled && pending && !flushing) {
    banner = {
      tone: "warn",
      icon: <CloudOff className="size-4" />,
      text: `Sinal fraco — ${plural(pending)} aguardando envio`,
      action: (
        <button type="button" onClick={() => void flush()} className="-my-2 inline-flex h-9 items-center gap-1 px-1 font-semibold">
          <RefreshCw className="size-3.5" />
          Tentar
        </button>
      ),
    };
  } else if (pending && slow) {
    banner = { tone: "sync", icon: <Loader2 className="size-4 animate-spin" />, text: `Enviando ${plural(pending)}…` };
  } else if (justSynced) {
    banner = { tone: "ok", icon: <CheckCircle2 className="size-4" />, text: "Tudo enviado" };
  }

  return (
    <div className="pointer-events-none sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 h-0" aria-live="polite">
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.tone}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex justify-center px-4 pt-2"
          >
            <div
              role="status"
              className={cn(
                "pointer-events-auto flex min-h-9 max-w-full items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium shadow-[0_8px_24px_-8px_rgb(0_0_0/0.7)] ring-1 backdrop-blur-xl",
                banner.tone === "off" && "bg-[#2a1d0a]/95 text-brass ring-brass/40",
                banner.tone === "warn" && "bg-[#2a1d0a]/95 text-brass ring-brass/40",
                banner.tone === "sync" && "bg-glacier/95 text-frost ring-ice/30",
                banner.tone === "ok" && "bg-[#06261f]/95 text-mint ring-mint/35",
              )}
            >
              <span className="shrink-0">{banner.icon}</span>
              <span className="min-w-0 leading-snug">{banner.text}</span>
              {banner.action && <span className="shrink-0">{banner.action}</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
