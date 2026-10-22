"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { Field, nativeSelectClass, useActionToast } from "@/components/system/form";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { initialActionState, type ActionState } from "@/lib/action";
import { formatDateTime } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { MAX_UPLOAD_LABEL } from "@/lib/upload";
import { batchBySize, fitImage, isImageFile, UPLOAD_BUDGET_BYTES } from "@/lib/upload-client";
import { removePhotoAction, uploadPhotosAction } from "../../actions";
import { PHOTO_KINDS, photoKindLabel } from "../../_lib/constants";

export type PhotoItem = { id: string; url: string; kind: string; caption: string | null; createdAt: string; taskTitle: string | null };

const KIND_TONE: Record<string, Tone> = { antes: "frost", depois: "mint", problema: "red", outro: "steel" };

const MAX_PHOTOS_PER_UPLOAD = 10;

/**
 * Fotos chegam do celular com 4–10 MB: reduz cada uma no navegador e envia em lotes que cabem
 * no limite de uma requisição (MAX_UPLOAD_BYTES), em vez de mandar tudo de uma vez.
 */
function UploadForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [state, setState] = useState<ActionState>(initialActionState);
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);
  useActionToast(state, { onSuccess: onDone });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    const picked = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!picked.length) {
      setState({ ok: false, error: "Escolha pelo menos uma foto.", fieldErrors: { files: "Escolha uma foto." } });
      return;
    }
    if (picked.length > MAX_PHOTOS_PER_UPLOAD) {
      const msg = `Envie no máximo ${MAX_PHOTOS_PER_UPLOAD} fotos por vez.`;
      setState({ ok: false, error: msg, fieldErrors: { files: msg } });
      return;
    }
    const notImage = picked.find((f) => !isImageFile(f));
    if (notImage) {
      const msg = `"${notImage.name}" não é uma imagem. Envie JPG, PNG ou WEBP.`;
      setState({ ok: false, error: msg, fieldErrors: { files: msg } });
      return;
    }

    // fora da transição: o aviso aparece já (dentro dela, só quando tudo terminasse)
    setProgress(picked.length === 1 ? "Reduzindo a foto…" : "Reduzindo as fotos…");
    startTransition(async () => {
      const ready: File[] = [];
      for (const f of picked) ready.push(await fitImage(f)); // uma por vez: poupa memória no celular
      const tooBig = ready.find((f) => f.size > UPLOAD_BUDGET_BYTES);
      if (tooBig) {
        const msg = `"${tooBig.name}" passa de ${MAX_UPLOAD_LABEL} e não pôde ser reduzida. Envie em JPG ou PNG.`;
        setProgress(null);
        setState({ ok: false, error: msg, fieldErrors: { files: msg } });
        return;
      }

      const batches = batchBySize(ready);
      let sent = 0;
      for (const [i, batch] of batches.entries()) {
        if (batches.length > 1) setProgress(`Enviando ${i + 1} de ${batches.length}…`);
        const part = new FormData();
        part.set("kind", String(fd.get("kind") ?? ""));
        part.set("caption", String(fd.get("caption") ?? ""));
        for (const f of batch) part.append("files", f, f.name);
        let r: ActionState;
        try {
          r = await uploadPhotosAction(id, initialActionState, part);
        } catch {
          r = { ok: false, error: "Não foi possível enviar as fotos. Confira a conexão e tente de novo." };
        }
        if (!r.ok) {
          const done = sent === 1 ? "1 foto foi enviada" : `${sent} fotos foram enviadas`;
          setProgress(null);
          setState(sent > 0 ? { ...r, error: `${done}, mas o restante falhou. ${r.error ?? ""}`.trim() } : r);
          return;
        }
        sent += batch.length;
      }
      setProgress(null);
      setState({ ok: true, message: sent === 1 ? "Foto enviada" : `${sent} fotos enviadas` });
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 border-t border-rime px-5 py-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <Field label="Tipo" htmlFor="photo-kind" error={state.fieldErrors?.kind}>
        <select id="photo-kind" name="kind" className={nativeSelectClass} defaultValue="antes">
          {PHOTO_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Fotos"
        htmlFor="photo-files"
        error={state.fieldErrors?.files}
        hint={`JPG, PNG ou WEBP, até ${MAX_PHOTOS_PER_UPLOAD} por vez. Fotos grandes são reduzidas antes do envio.`}
      >
        <Input id="photo-files" name="files" type="file" accept="image/*" multiple className="h-9 py-1.5 text-sm" required />
      </Field>
      <Field label="Legenda" htmlFor="photo-caption" className="sm:col-span-2">
        <Input id="photo-caption" name="caption" className="h-9" maxLength={200} placeholder="Opcional: o que a foto mostra" />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        {progress && (
          <p role="status" className="mr-auto text-xs text-steel">
            {progress}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Voltar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Enviar fotos
        </Button>
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
