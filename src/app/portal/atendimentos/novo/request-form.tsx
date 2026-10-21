"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CircleHelp, ImagePlus, X } from "lucide-react";
import { SubmitButton, useActionToast } from "@/components/system/form";
import { nativeSelectClass } from "@/components/system/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { cn } from "@/lib/utils";
import { EquipmentTile } from "../../_components/bits";
import { setInputFiles, shrinkImage } from "../../_lib/compress";
import { MAX_REQUEST_PHOTOS, PROBLEM_CHIPS, UPLOAD_LIMIT_BYTES, URGENCY_OPTIONS } from "../../_lib/copy";
import { createServiceRequest } from "./actions";

export type EquipOption = {
  id: string;
  name: string;
  location: string | null;
  typeName: string | null;
  icon: string | null;
  siteId: string | null;
};
export type SiteOption = { id: string; name: string; address: string };

export function RequestForm({
  equipment,
  sites,
  initialEquipmentId,
}: {
  equipment: EquipOption[];
  sites: SiteOption[];
  initialEquipmentId: string | null;
}) {
  const [state, formAction] = useActionState(createServiceRequest, initialActionState);
  useActionToast(state);
  const [equipmentId, setEquipmentId] = useState<string>(initialEquipmentId ?? (equipment.length ? "" : "outro"));
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [urgency, setUrgency] = useState<string>("normal");
  const chosen = equipment.find((e) => e.id === equipmentId) ?? null;
  const needsSite = sites.length > 1 && (!chosen || !chosen.siteId);
  const [eqError, setEqError] = useState<string | null>(null);
  const fe = state.fieldErrors ?? {};

  function choose(id: string) {
    setEquipmentId(id);
    setEqError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!equipmentId) {
      e.preventDefault();
      setEqError("Escolha o equipamento, ou \"Outro / não sei\".");
      document.getElementById("passo-equipamento")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-6">
      {/* 1. Equipamento */}
      <Step n={1} id="passo-equipamento" title="Qual equipamento?" hint="Se não souber qual é, escolha a última opção.">
        <input type="hidden" name="equipmentId" value={equipmentId} />
        <div role="radiogroup" aria-label="Equipamento" className="grid gap-2 sm:grid-cols-2">
          {equipment.map((e) => (
            <Choice key={e.id} selected={equipmentId === e.id} onSelect={() => choose(e.id)}>
              <EquipmentTile icon={e.icon} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-silver">{e.name}</span>
                <span className="block truncate text-xs text-steel">{e.location ?? e.typeName ?? "Sem local informado"}</span>
              </span>
            </Choice>
          ))}
          <Choice selected={equipmentId === "outro"} onSelect={() => choose("outro")}>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-steel/10 text-steel ring-1 ring-rime">
              <CircleHelp className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-silver">Outro / não sei</span>
              <span className="block text-xs text-steel">Um aparelho novo ou que não está na lista</span>
            </span>
          </Choice>
        </div>
        {(eqError ?? fe.equipmentId) && (
          <p role="alert" className="mt-2 text-xs text-gauge-red">
            {eqError ?? fe.equipmentId}
          </p>
        )}

        {needsSite ? (
          <div className="mt-4 space-y-1.5">
            <label htmlFor="siteId" className="text-sm font-medium text-silver">
              Em qual endereço?
            </label>
            <select id="siteId" name="siteId" defaultValue={sites[0]?.id} className={cn(nativeSelectClass, "h-11")}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.address ? ` — ${s.address}` : ""}
                </option>
              ))}
            </select>
            {fe.siteId && <p className="text-xs text-gauge-red">{fe.siteId}</p>}
          </div>
        ) : (
          sites.length === 1 && <input type="hidden" name="siteId" value={sites[0].id} />
        )}
      </Step>

      {/* 2. Problema */}
      <Step n={2} title="O que está acontecendo?" hint="Marque o que se aplica e, se puder, conte com suas palavras.">
        <div className="flex flex-wrap gap-2">
          {PROBLEM_CHIPS.map((c) => {
            const on = symptoms.includes(c);
            return (
              <label
                key={c}
                className={cn(
                  "relative inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full px-3.5 py-2 text-sm ring-1 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-frost",
                  on ? "bg-ice/15 text-silver ring-ice/45" : "bg-night/60 text-steel ring-rime hover:text-silver",
                )}
              >
                <input
                  type="checkbox"
                  name="sintomas"
                  value={c}
                  checked={on}
                  onChange={(e) => setSymptoms((s) => (e.target.checked ? [...s, c] : s.filter((x) => x !== c)))}
                  className="sr-only"
                />
                <AnimatePresence initial={false}>
                  {on && (
                    <motion.span
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="inline-flex overflow-hidden text-ice"
                    >
                      <Check className="size-3.5" />
                    </motion.span>
                  )}
                </AnimatePresence>
                {c}
              </label>
            );
          })}
        </div>
        <div className="mt-4 space-y-1.5">
          <label htmlFor="descricao" className="text-sm font-medium text-silver">
            Descreva com suas palavras
          </label>
          <Textarea
            id="descricao"
            name="descricao"
            rows={4}
            maxLength={2000}
            aria-invalid={Boolean(fe.descricao)}
            placeholder="Ex.: desde ontem o ar da sala liga, mas não gela e está fazendo um barulho diferente."
          />
          {fe.descricao && <p className="text-xs text-gauge-red">{fe.descricao}</p>}
        </div>
      </Step>

      {/* 3. Urgência */}
      <Step n={3} title="Qual a urgência?">
        <div role="radiogroup" aria-label="Urgência" className="grid grid-cols-3 gap-2">
          {URGENCY_OPTIONS.map((o) => {
            const on = urgency === o.value;
            return (
              <label
                key={o.value}
                className={cn(
                  "relative cursor-pointer rounded-xl px-3 py-3 ring-1 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-frost",
                  on
                    ? o.value === "urgente"
                      ? "bg-gauge-red/10 ring-gauge-red/45"
                      : o.value === "alta"
                        ? "bg-brass/10 ring-brass/45"
                        : "bg-ice/12 ring-ice/45"
                    : "bg-night/60 ring-rime hover:ring-rime-strong",
                )}
              >
                <input
                  type="radio"
                  name="prioridade"
                  value={o.value}
                  checked={on}
                  onChange={() => setUrgency(o.value)}
                  className="sr-only"
                />
                <span className={cn("block text-sm font-medium", on ? "text-silver" : "text-steel")}>{o.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-steel">{o.hint}</span>
              </label>
            );
          })}
        </div>
      </Step>

      {/* 4. Fotos */}
      <Step n={4} title="Fotos" hint={`Opcional. Até ${MAX_REQUEST_PHOTOS} fotos do aparelho ou do problema ajudam o técnico a levar a peça certa.`}>
        <PhotoPicker error={fe.fotos} />
      </Step>

      {/* 5. Período */}
      <Step n={5} title="Melhor período para a visita" hint="Opcional. A equipe confirma a data com você.">
        <Input
          name="periodo"
          maxLength={200}
          className="h-11"
          placeholder="Ex.: manhãs, ou depois das 14h"
          aria-invalid={Boolean(fe.periodo)}
        />
        {fe.periodo && <p className="mt-1 text-xs text-gauge-red">{fe.periodo}</p>}
      </Step>

      <div className="flex flex-col-reverse gap-3 border-t border-rime pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-steel">Você acompanha o andamento em Atendimentos e recebe um aviso a cada etapa.</p>
        <SubmitButton size="lg" className="h-12 w-full text-[0.95rem] sm:w-auto sm:px-6">
          Enviar solicitação
        </SubmitButton>
      </div>
    </form>
  );
}

function Step({ n, id, title, hint, children }: { n: number; id?: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset id={id} className="panel scroll-mt-24 p-4 sm:p-5">
      <legend className="sr-only">{title}</legend>
      <div className="mb-3.5 flex items-start gap-3">
        <span className="readout grid size-7 shrink-0 place-items-center rounded-full bg-ice/12 text-xs font-semibold text-ice ring-1 ring-ice/25">
          {n}
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-[0.95rem] font-semibold text-silver">{title}</p>
          {hint && <p className="mt-0.5 text-xs text-steel">{hint}</p>}
        </div>
      </div>
      {children}
    </fieldset>
  );
}

function Choice({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors",
        selected ? "bg-ice/10 ring-ice/45" : "bg-night/50 ring-rime hover:ring-rime-strong",
      )}
    >
      {children}
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full ring-1 transition-colors",
          selected ? "bg-ice text-abyss ring-ice" : "ring-steel/40",
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
    </button>
  );
}

type Picked = { file: File; url: string };

function PhotoPicker({ error }: { error?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setLocalError(null);
    const picked = Array.from(e.target.files ?? []);
    const prev = items.map((i) => i.file);
    const room = MAX_REQUEST_PHOTOS - prev.length;
    const images = picked.filter((f) => f.type.startsWith("image/"));
    let warning: string | null = null;
    if (images.length < picked.length) warning = "Somente imagens (JPG ou PNG).";
    if (images.length > room) warning = `Envie até ${MAX_REQUEST_PHOTOS} fotos.`;
    setBusy(true);
    const ready = await Promise.all(images.slice(0, Math.max(0, room)).map((f) => shrinkImage(f)));
    setBusy(false);
    const accepted: File[] = [];
    let total = prev.reduce((s, f) => s + f.size, 0);
    for (const f of ready) {
      if (total + f.size > UPLOAD_LIMIT_BYTES - 64 * 1024) {
        warning = "As fotos somam mais de 8 MB. Algumas ficaram de fora.";
        continue;
      }
      total += f.size;
      accepted.push(f);
    }
    setLocalError(warning);
    if (inputRef.current) setInputFiles(inputRef.current, [...prev, ...accepted]);
    const added = accepted.map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { file, url };
    });
    setItems([...items, ...added]);
  }

  function remove(idx: number) {
    const next = items.filter((_, i) => i !== idx);
    URL.revokeObjectURL(items[idx].url);
    if (inputRef.current) setInputFiles(inputRef.current, next.map((i) => i.file));
    setItems(next);
    setLocalError(null);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <AnimatePresence initial={false}>
          {items.map((it, i) => (
            <motion.div
              key={it.url}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="relative size-20 overflow-hidden rounded-xl ring-1 ring-rime"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.url} alt={`Foto ${i + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-abyss/80 text-silver ring-1 ring-rime hover:bg-abyss"
                aria-label={`Remover foto ${i + 1}`}
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length < MAX_REQUEST_PHOTOS && (
          <label
            htmlFor="fotos"
            className="grid size-20 cursor-pointer place-items-center rounded-xl border border-dashed border-rime-strong text-steel transition-colors hover:border-ice/40 hover:text-frost has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-frost"
          >
            <span className="flex flex-col items-center gap-1 text-[0.7rem]">
              <ImagePlus className="size-5" />
              {busy ? "Preparando…" : "Adicionar"}
            </span>
          </label>
        )}
      </div>
      <input
        ref={inputRef}
        id="fotos"
        name="fotos"
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={onPick}
      />
      {(localError ?? error) && <p className="mt-2 text-xs text-gauge-red">{localError ?? error}</p>}
    </div>
  );
}
