"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toneOnTint } from "@/components/system/tone-badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { openCorrectiveAction } from "../actions";

const PRIORITIES = [
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
] as const;

export function OpenCorrective({ equipmentId, label }: { equipmentId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]["value"]>("normal");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (description.trim().length < 5) {
      setError("Descreva o problema em poucas palavras (pelo menos 5 letras).");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const r = await openCorrectiveAction({ equipmentId, description, priority });
        if (!r.ok || !r.id) {
          setError(r.error ?? "Não foi possível abrir a OM.");
          return;
        }
        toast.success("OM corretiva aberta", { description: "Ela já está na sua lista de hoje." });
        router.push(`/tecnico/om/${r.id}`);
      } catch {
        setError("Sem conexão. Abrir uma OM precisa de internet; tente de novo quando o sinal voltar.");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-ice to-ice-deep text-[1.02rem] font-semibold text-abyss shadow-[0_10px_30px_-10px_var(--glow-ice)]"
        >
          <Wrench className="size-5" />
          Abrir OM corretiva
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-xl gap-0 overflow-y-auto rounded-t-3xl border-rime bg-night p-0 pb-[env(safe-area-inset-bottom)]">
        <SheetHeader className="px-5 pb-3 pt-5">
          <SheetTitle className="font-sans text-lg font-semibold text-silver">Abrir OM corretiva</SheetTitle>
          <SheetDescription>
            {label}. A OM fica com você, para hoje, e o serviço é cobrado à parte do contrato.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-5 px-5 pb-5" noValidate>
          <div className="space-y-2">
            <label htmlFor="corr-desc" className="text-sm font-medium text-silver">
              Qual é o problema?
            </label>
            <Textarea
              id="corr-desc"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value.slice(0, 1000));
                if (error) setError(null);
              }}
              placeholder="Ex.: aparelho pingando água na evaporadora e sem gelar."
              aria-invalid={Boolean(error)}
              className="min-h-28 rounded-xl bg-abyss/50 text-[0.95rem]"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-silver">Prioridade</p>
            <div role="radiogroup" aria-label="Prioridade" className="grid grid-cols-3 gap-1 rounded-2xl bg-abyss/50 p-1 ring-1 ring-rime">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={priority === p.value}
                  onClick={() => setPriority(p.value)}
                  className={cn(
                    "h-11 rounded-xl text-sm font-medium transition-colors",
                    priority === p.value
                      ? p.value === "urgente"
                        ? cn("bg-gauge-red/15 ring-1 ring-gauge-red/35", toneOnTint.red)
                        : p.value === "alta"
                          ? cn("bg-brass/15 ring-1 ring-brass/35", toneOnTint.brass)
                          : "bg-ice/15 text-silver ring-1 ring-ice/30"
                      : "text-steel",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p role="alert" className={cn("rounded-xl bg-gauge-red/10 px-3.5 py-2.5 text-sm ring-1 ring-gauge-red/30", toneOnTint.red)}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-ice to-ice-deep text-[1.02rem] font-semibold text-abyss disabled:opacity-60"
          >
            {pending && <Loader2 className="size-5 animate-spin" />}
            Abrir OM
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
