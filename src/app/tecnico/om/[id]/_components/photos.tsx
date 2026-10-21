"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, CloudUpload, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { removePhotoAction } from "../actions";
import type { ExecPhoto } from "../_lib/types";

export type PhotoKind = "antes" | "depois" | "problema";
const KINDS: { value: PhotoKind; label: string }[] = [
  { value: "antes", label: "Antes" },
  { value: "depois", label: "Depois" },
  { value: "problema", label: "Problema" },
];
const KIND_LABEL: Record<string, string> = { antes: "Antes", depois: "Depois", problema: "Problema", outro: "Foto" };

export type QueuedPhoto = { id: string; dataUrl: string; kind: string; taskId: string | null };

export function Photos({
  photos,
  queued,
  closed,
  online,
  processing,
  kind,
  onKindChange,
  onCapture,
  taskTitles,
}: {
  photos: ExecPhoto[];
  queued: QueuedPhoto[];
  closed: boolean;
  online: boolean;
  processing: boolean;
  kind: PhotoKind;
  onKindChange: (k: PhotoKind) => void;
  onCapture: () => void;
  taskTitles: Map<string, string>;
}) {
  const [viewing, setViewing] = useState<ExecPhoto | null>(null);
  const [removing, startRemove] = useTransition();
  const total = photos.length + queued.length;

  return (
    <div className="space-y-3">
      {!closed && (
        <div className="space-y-2.5">
          <div role="radiogroup" aria-label="Tipo da foto" className="grid grid-cols-3 gap-1 rounded-2xl bg-night/60 p-1 ring-1 ring-rime">
            {KINDS.map((k) => {
              const active = kind === k.value;
              return (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onKindChange(k.value)}
                  className={cn("relative h-11 rounded-xl text-sm font-medium transition-colors", active ? "text-silver" : "text-steel")}
                >
                  {active && (
                    <motion.span
                      layoutId="photo-kind"
                      className={cn(
                        "absolute inset-0 rounded-xl ring-1",
                        k.value === "problema" ? "bg-gauge-red/15 ring-gauge-red/35" : "bg-ice/15 ring-ice/30",
                      )}
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className="relative">{k.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onCapture}
            disabled={processing}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-glacier text-[0.98rem] font-semibold text-silver ring-1 ring-ice/30 transition-colors active:bg-glacier-2 disabled:opacity-60"
          >
            {processing ? <Loader2 className="size-5 animate-spin text-ice" /> : <Camera className="size-5 text-ice" />}
            {processing ? "Preparando a foto…" : `Tirar foto (${KIND_LABEL[kind].toLowerCase()})`}
          </button>
          {!online && <p className="text-xs text-brass">Sem conexão: as fotos ficam guardadas no aparelho e são enviadas depois.</p>}
        </div>
      )}

      {total > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          <AnimatePresence initial={false}>
            {queued.map((p) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-brass/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt="" className="size-full object-cover opacity-70" />
                <span className="absolute inset-0 grid place-items-center bg-abyss/30">
                  {online ? <Loader2 className="size-6 animate-spin text-frost" /> : <CloudUpload className="size-6 text-brass" />}
                </span>
                <span className="absolute inset-x-1 bottom-1 truncate rounded-md bg-abyss/80 px-1.5 py-0.5 text-[0.68rem] text-brass">
                  {online ? "Enviando…" : "Aguardando envio"}
                </span>
              </motion.li>
            ))}
            {photos.map((p) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-rime"
              >
                <button type="button" onClick={() => setViewing(p)} className="block size-full" aria-label={`Ver foto ${KIND_LABEL[p.kind]}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
                </button>
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-1 left-1 rounded-md px-1.5 py-0.5 text-[0.68rem] font-medium",
                    p.kind === "problema" ? "bg-gauge-red/85 text-white" : "bg-abyss/80 text-frost",
                  )}
                >
                  {KIND_LABEL[p.kind]}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        closed && <p className="rounded-2xl bg-night/50 px-4 py-5 text-sm text-steel ring-1 ring-rime">Nenhuma foto registrada nesta OM.</p>
      )}

      <Dialog open={viewing != null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-[calc(100%-1.5rem)] gap-3 p-2 sm:max-w-lg">
          <DialogTitle className="sr-only">Foto {viewing ? KIND_LABEL[viewing.kind] : ""}</DialogTitle>
          <DialogDescription className="sr-only">Foto registrada na OM.</DialogDescription>
          {viewing && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={viewing.url} alt={`Foto ${KIND_LABEL[viewing.kind]}`} className="max-h-[70dvh] w-full rounded-lg object-contain" />
              <div className="flex items-center justify-between gap-2 px-2 pb-1">
                <p className="min-w-0 truncate text-sm text-steel">
                  {KIND_LABEL[viewing.kind]}
                  {viewing.taskId && taskTitles.get(viewing.taskId) ? ` — ${taskTitles.get(viewing.taskId)}` : ""}
                </p>
                {!closed && (
                  <button
                    type="button"
                    disabled={removing || !online}
                    onClick={() =>
                      startRemove(async () => {
                        const r = await removePhotoAction(viewing.id);
                        if (r.ok === false) toast.error(r.error ?? "Não foi possível remover a foto.");
                        else {
                          toast.success("Foto removida");
                          setViewing(null);
                        }
                      })
                    }
                    className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-gauge-red active:bg-gauge-red/10 disabled:opacity-50"
                  >
                    {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    Remover foto
                  </button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
