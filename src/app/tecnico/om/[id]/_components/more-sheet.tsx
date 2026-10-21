"use client";

import { useState } from "react";
import { Loader2, MapPinCheck, Navigation, PackageX, PauseCircle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { canTransition, type WorkOrderStatus } from "@/server/core/work-order-flow";

type Reason = "aguardando_material" | "pausada";

const REASONS: { value: Reason; title: string; hint: string; icon: typeof PackageX }[] = [
  { value: "aguardando_material", title: "Falta material", hint: "Peça, gás ou ferramenta que não está no veículo", icon: PackageX },
  { value: "pausada", title: "Pausar e voltar depois", hint: "Cliente ausente, sem acesso, chuva, horário…", icon: PauseCircle },
];

export function MoreSheet({
  open,
  onOpenChange,
  status,
  atSite,
  busy,
  onStatus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  status: string;
  atSite: boolean;
  busy: boolean;
  onStatus: (to: WorkOrderStatus, note?: string) => Promise<boolean>;
}) {
  const from = status as WorkOrderStatus;
  const reasons = REASONS.filter((r) => canTransition(from, r.value));
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chosen = reason && reasons.some((r) => r.value === reason) ? reason : (reasons[0]?.value ?? null);

  const startHere = !atSite && ["aberta", "agendada", "aguardando_material"].includes(status);
  const onTheWay = atSite && ["aberta", "agendada", "aguardando_material", "pausada"].includes(status);

  function close() {
    onOpenChange(false);
    setTimeout(() => {
      setNote("");
      setReason(null);
      setError(null);
    }, 250);
  }

  async function register() {
    if (!chosen) return;
    if (note.trim().length < 5) {
      setError("Conte em poucas palavras o motivo (o escritório usa isso para reagendar).");
      return;
    }
    const ok = await onStatus(chosen, `Não atendida: ${note.trim()}`);
    if (ok) close();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-xl gap-0 overflow-y-auto rounded-t-3xl border-rime bg-night p-0 pb-[env(safe-area-inset-bottom)]">
        <SheetHeader className="px-5 pb-3 pt-5">
          <SheetTitle className="font-sans text-lg font-semibold text-silver">Mais opções</SheetTitle>
          <SheetDescription>Use quando o atendimento não seguir o caminho normal.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-5 pb-5">
          {(startHere || onTheWay) && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const ok = await onStatus(startHere ? "em_execucao" : "em_deslocamento");
                if (ok) close();
              }}
              className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-glacier px-4 py-3 text-left ring-1 ring-ice/25 active:bg-glacier-2 disabled:opacity-60"
            >
              {startHere ? <MapPinCheck className="size-5 shrink-0 text-ice" /> : <Navigation className="size-5 shrink-0 text-ice" />}
              <span>
                <span className="block text-[0.95rem] font-medium text-silver">
                  {startHere ? "Já estou no local, iniciar atendimento" : "Estou a caminho"}
                </span>
                <span className="block text-xs text-steel">
                  {startHere ? "Pula o deslocamento e libera o checklist" : "Avisa o cliente que você está indo"}
                </span>
              </span>
            </button>
          )}

          {reasons.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[0.95rem] font-semibold text-silver">Não consegui atender</p>
              <div role="radiogroup" aria-label="Motivo" className="space-y-2">
                {reasons.map((r) => {
                  const Icon = r.icon;
                  const active = chosen === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setReason(r.value)}
                      className={cn(
                        "flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-colors",
                        active ? "bg-brass/10 ring-brass/45" : "bg-night ring-rime active:bg-ice/5",
                      )}
                    >
                      <Icon className={cn("size-5 shrink-0", active ? "text-brass" : "text-steel")} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.95rem] font-medium text-silver">{r.title}</span>
                        <span className="block text-xs text-steel">{r.hint}</span>
                      </span>
                      <span className={cn("size-5 shrink-0 rounded-full ring-2", active ? "bg-brass ring-brass" : "ring-steel/50")} />
                    </button>
                  );
                })}
              </div>
              <Textarea
                value={note}
                onChange={(e) => {
                  setNote(e.target.value.slice(0, 500));
                  if (error) setError(null);
                }}
                placeholder={chosen === "aguardando_material" ? "Qual material falta? Ex.: capacitor 35 µF" : "O que aconteceu? Ex.: cliente não estava no local"}
                aria-invalid={Boolean(error)}
                className="min-h-20 rounded-xl bg-abyss/50 text-[0.95rem]"
              />
              {error && <p className="text-sm text-gauge-red">{error}</p>}
              <button
                type="button"
                onClick={register}
                disabled={busy}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brass text-[0.98rem] font-semibold text-abyss disabled:opacity-60"
              >
                {busy && <Loader2 className="size-5 animate-spin" />}
                Registrar e avisar o escritório
              </button>
            </div>
          ) : (
            !startHere && !onTheWay && <p className="text-sm text-steel">Nenhuma outra ação disponível neste momento.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
