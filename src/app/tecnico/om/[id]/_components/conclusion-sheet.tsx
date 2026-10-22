"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCheck, Loader2, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toneOnTint } from "@/components/system/tone-badge";
import { cn } from "@/lib/utils";
import { loadDraft, saveDraft, type ConclusionDraft } from "../_lib/draft";
import { SignaturePad, type SignaturePadHandle, type SignatureStroke } from "./signature-pad";

export type ConclusionForm = {
  solution: string;
  diagnosis: string | null;
  technicianNotes: string | null;
  signedByName: string | null;
  signature: string | null;
};

export type ConcludeOutcome = { error?: string; fieldErrors?: Record<string, string> } | void;

const QUICK_PLAN = "Manutenção preventiva realizada conforme o checklist. Equipamento operando normalmente.";
const QUICK_CLEAN = "Limpeza completa de filtros, evaporadora e dreno. Equipamento testado e operando normalmente.";

function ConclusionFormBody({
  workOrderId,
  type,
  isPlanVisit,
  online,
  initial,
  onConclude,
}: {
  workOrderId: string;
  type: string;
  isPlanVisit: boolean;
  online: boolean;
  initial: { solution: string | null; diagnosis: string | null; technicianNotes: string | null };
  onConclude: (form: ConclusionForm) => Promise<ConcludeOutcome>;
}) {
  const [draft, setDraft] = useState<ConclusionDraft>(() => {
    const saved = loadDraft(workOrderId);
    return {
      solution: saved?.solution ?? initial.solution ?? "",
      diagnosis: saved?.diagnosis ?? initial.diagnosis ?? "",
      technicianNotes: saved?.technicianNotes ?? initial.technicianNotes ?? "",
      signedByName: saved?.signedByName ?? "",
      strokes: saved?.strokes ?? null,
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);
  const [initialStrokes] = useState<SignatureStroke[] | null>(draft.strokes);

  useEffect(() => {
    const t = setTimeout(() => saveDraft(workOrderId, draft), 250);
    return () => clearTimeout(t);
  }, [draft, workOrderId]);

  const set = <K extends keyof ConclusionDraft>(k: K, v: ConclusionDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const corrective = type === "corretiva";
  const hasSignature = Boolean(draft.strokes?.length);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (draft.solution.trim().length < 3) fe.solution = "Descreva o que foi feito.";
    if (hasSignature && draft.signedByName.trim().length < 2) fe.signedByName = "Informe o nome de quem assinou.";
    setErrors(fe);
    if (Object.keys(fe).length) {
      setError(null);
      document.getElementById(`conc-${Object.keys(fe)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await onConclude({
      solution: draft.solution.trim(),
      diagnosis: draft.diagnosis.trim() || null,
      technicianNotes: draft.technicianNotes.trim() || null,
      signedByName: hasSignature ? draft.signedByName.trim() : null,
      signature: hasSignature ? pad.current?.toDataURL() ?? null : null,
    });
    setBusy(false);
    if (outcome?.error) setError(outcome.error);
    if (outcome?.fieldErrors) setErrors(outcome.fieldErrors);
  }

  return (
    <form onSubmit={submit} className="space-y-5 px-5 pb-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="conc-solution" className="text-sm font-medium text-silver">
          O que foi feito<span className="ml-0.5 text-ice">*</span>
        </label>
        <Textarea
          id="conc-solution"
          value={draft.solution}
          onChange={(e) => set("solution", e.target.value.slice(0, 4000))}
          placeholder={corrective ? "Ex.: troca do capacitor do compressor e teste de funcionamento." : "Descreva o serviço realizado."}
          aria-invalid={Boolean(errors.solution)}
          className="min-h-24 rounded-xl bg-abyss/50 text-[0.95rem]"
        />
        {errors.solution && <p className="text-xs text-gauge-red">{errors.solution}</p>}
        {!draft.solution.trim() && (
          <div className="flex flex-wrap gap-2">
            {(isPlanVisit ? [QUICK_PLAN, QUICK_CLEAN] : [QUICK_CLEAN]).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => set("solution", q)}
                className="min-h-10 rounded-xl bg-ice/8 px-3 py-2 text-left text-xs leading-snug text-frost ring-1 ring-ice/20 active:bg-ice/15"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="conc-diagnosis" className="text-sm font-medium text-silver">
          {corrective ? "Defeito encontrado" : "Diagnóstico"} <span className="font-normal text-steel">(opcional)</span>
        </label>
        <Textarea
          id="conc-diagnosis"
          value={draft.diagnosis}
          onChange={(e) => set("diagnosis", e.target.value.slice(0, 4000))}
          placeholder={corrective ? "O que causava o problema?" : "Algo que o cliente precisa saber sobre o equipamento?"}
          className="min-h-16 rounded-xl bg-abyss/50 text-[0.95rem]"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-silver">Assinatura do cliente</p>
        <SignaturePad ref={pad} initialStrokes={initialStrokes} onChange={(s) => set("strokes", s.length ? s : null)} />
        <div className="space-y-1.5 pt-1">
          <label htmlFor="conc-signedByName" className="text-sm text-steel">
            Nome de quem assinou
          </label>
          <Input
            id="conc-signedByName"
            value={draft.signedByName}
            onChange={(e) => set("signedByName", e.target.value.slice(0, 120))}
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="done"
            aria-invalid={Boolean(errors.signedByName)}
            placeholder="Nome completo"
            className="h-12 rounded-xl text-base"
          />
          {errors.signedByName && <p className="text-xs text-gauge-red">{errors.signedByName}</p>}
          {!hasSignature && (
            <p className="text-xs text-steel">Sem ninguém para assinar? Conclua assim mesmo e explique nas observações.</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="conc-technicianNotes" className="text-sm font-medium text-silver">
          Observações para o escritório <span className="font-normal text-steel">(opcional)</span>
        </label>
        <Textarea
          id="conc-technicianNotes"
          value={draft.technicianNotes}
          onChange={(e) => set("technicianNotes", e.target.value.slice(0, 4000))}
          placeholder="Ex.: cliente pediu orçamento para trocar o aparelho da sala 2."
          className="min-h-16 rounded-xl bg-abyss/50 text-[0.95rem]"
        />
      </div>

      {error && (
        <p role="alert" className={cn("rounded-xl bg-gauge-red/10 px-3.5 py-3 text-sm leading-relaxed ring-1 ring-gauge-red/30", toneOnTint.red)}>
          {error}
        </p>
      )}
      {!online && (
        <p className={cn("flex gap-2 rounded-xl bg-brass/10 px-3.5 py-3 text-sm ring-1 ring-brass/30 light:bg-notice-brass", toneOnTint.brass)}>
          <WifiOff className="mt-0.5 size-4 shrink-0" />
          Sem conexão. Para concluir é preciso internet; o rascunho e a assinatura ficam salvos neste aparelho.
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !online}
        className={cn(
          "flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-mint to-[#22b98f] text-[1.02rem] font-semibold text-abyss shadow-[0_10px_30px_-10px_var(--glow-mint)] transition-opacity disabled:opacity-50",
          // claro: verde mais fundo embaixo para a tinta clara passar o contraste (mesma regra da barra de ação)
          "light:to-[color-mix(in_srgb,var(--mint)_78%,var(--silver))] light:shadow-[0_10px_24px_-10px_var(--glow-mint)]",
        )}
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <CheckCheck className="size-5" />}
        {busy ? "Concluindo…" : "Concluir OM"}
      </button>
    </form>
  );
}

export function ConclusionSheet({
  open,
  onOpenChange,
  ...props
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
} & React.ComponentProps<typeof ConclusionFormBody>) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        side="bottom"
        className="mx-auto max-h-[94dvh] max-w-xl gap-0 overflow-y-auto rounded-t-3xl border-rime bg-night p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="px-5 pb-4 pt-5">
          <SheetTitle className="font-display text-silver-brushed text-xl font-semibold">Concluir OM</SheetTitle>
          <SheetDescription>Revise o serviço, colete a assinatura e finalize.</SheetDescription>
        </SheetHeader>
        {open && <ConclusionFormBody {...props} />}
      </SheetContent>
    </Sheet>
  );
}
