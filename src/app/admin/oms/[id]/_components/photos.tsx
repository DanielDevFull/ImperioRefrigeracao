"use client";

import { useActionState, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { Field, SubmitButton, nativeSelectClass, useActionToast } from "@/components/system/form";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action";
import { formatDateTime } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { removePhotoAction, uploadPhotosAction } from "../../actions";
import { PHOTO_KINDS, photoKindLabel } from "../../_lib/constants";

export type PhotoItem = { id: string; url: string; kind: string; caption: string | null; createdAt: string; taskTitle: string | null };

const KIND_TONE: Record<string, Tone> = { antes: "frost", depois: "mint", problema: "red", outro: "steel" };

function UploadForm({ id, onDone }: { id: string; onDone: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(uploadPhotosAction.bind(null, id), initialActionState);
  useActionToast(state, {
    onSuccess: () => {
      formRef.current?.reset();
      onDone();
    },
  });
  return (
    <form ref={formRef} action={action} className="grid gap-3 border-t border-rime px-5 py-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <Field label="Tipo" htmlFor="photo-kind" error={state.fieldErrors?.kind}>
        <select id="photo-kind" name="kind" className={nativeSelectClass} defaultValue="antes">
          {PHOTO_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Fotos" htmlFor="photo-files" error={state.fieldErrors?.files} hint="JPG, PNG ou WEBP, até 8 MB cada.">
        <Input id="photo-files" name="files" type="file" accept="image/*" multiple className="h-9 py-1.5 text-sm" required />
      </Field>
      <Field label="Legenda" htmlFor="photo-caption" className="sm:col-span-2">
        <Input id="photo-caption" name="caption" className="h-9" maxLength={200} placeholder="Opcional: o que a foto mostra" />
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Voltar
        </Button>
        <SubmitButton>Enviar fotos</SubmitButton>
      </div>
    </form>
  );
}

export function Photos({ id, photos, canUpload }: { id: string; photos: PhotoItem[]; canUpload: boolean }) {
  const [index, setIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const current = index != null ? photos[index] : null;

  return (
    <div>
      {photos.length === 0 ? (
        <EmptyState
          className="py-10"
          title="Nenhuma foto ainda"
          description="O técnico registra fotos de antes e depois pelo app. A central também pode anexar fotos recebidas do cliente."
          action={
            canUpload && !uploading ? (
              <Button variant="outline" onClick={() => setUploading(true)}>
                <ImagePlus className="size-4" />
                Enviar fotos
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 xl:grid-cols-4">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setIndex(i)}
              className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-night ring-1 ring-rime transition hover:ring-ice/40"
              aria-label={`Ampliar foto ${photoKindLabel[p.kind] ?? p.kind}${p.caption ? `: ${p.caption}` : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption ?? `Foto ${photoKindLabel[p.kind] ?? ""}`} className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" />
              <span className="absolute left-2 top-2">
                <ToneBadge tone={KIND_TONE[p.kind] ?? "steel"} className="bg-abyss/80 backdrop-blur">
                  {photoKindLabel[p.kind] ?? p.kind}
                </ToneBadge>
              </span>
            </button>
          ))}
          {canUpload && !uploading && (
            <button
              type="button"
              onClick={() => setUploading(true)}
              className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-rime text-sm text-steel transition hover:border-ice/40 hover:text-frost"
            >
              <span className="flex flex-col items-center gap-1.5">
                <ImagePlus className="size-5" />
                Enviar fotos
              </span>
            </button>
          )}
        </div>
      )}
      {uploading && <UploadForm id={id} onDone={() => setUploading(false)} />}

      <Dialog open={current != null} onOpenChange={(v) => !v && setIndex(null)}>
        <DialogContent className="gap-3 p-3 sm:max-w-3xl">
          {current && (
            <>
              <DialogHeader className="px-1 pr-10">
                <DialogTitle className="flex items-center gap-2 font-sans text-sm font-semibold">
                  <ToneBadge tone={KIND_TONE[current.kind] ?? "steel"}>{photoKindLabel[current.kind] ?? current.kind}</ToneBadge>
                  <span className="truncate">{current.caption ?? current.taskTitle ?? "Foto da OM"}</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Foto {index! + 1} de {photos.length}, enviada em {formatDateTime(current.createdAt)}
                  {current.taskTitle && current.caption ? `, item "${current.taskTitle}"` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="relative overflow-hidden rounded-lg bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current.url} alt={current.caption ?? "Foto da OM"} className="mx-auto max-h-[70vh] w-auto object-contain" />
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Foto anterior"
                      onClick={() => setIndex((i) => ((i ?? 0) - 1 + photos.length) % photos.length)}
                      className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-abyss/70 text-silver backdrop-blur hover:bg-abyss"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Próxima foto"
                      onClick={() => setIndex((i) => ((i ?? 0) + 1) % photos.length)}
                      className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-abyss/70 text-silver backdrop-blur hover:bg-abyss"
                    >
                      <ChevronRight className="size-5" />
                    </button>
                  </>
                )}
              </div>
              {canUpload && (
                <div className="flex justify-end px-1">
                  <ConfirmAction
                    action={async () => {
                      const r = await removePhotoAction(current.id);
                      if (r.ok) setIndex(null);
                      return r;
                    }}
                    title="Remover esta foto?"
                    description="A foto deixa de aparecer na OM e no relatório do cliente."
                    confirmLabel="Remover foto"
                    variant="ghost"
                    destructive
                    className="text-gauge-red hover:text-gauge-red"
                  >
                    <Trash2 className="size-4" />
                    Remover foto
                  </ConfirmAction>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
