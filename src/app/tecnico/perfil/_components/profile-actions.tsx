"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, Loader2, LogOut, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { promptInstall, useInstallPrompt } from "@/components/pwa/install";
import { getOutboxItems } from "@/lib/offline/outbox";
import { authClient } from "@/lib/auth/client";

/** Instalar o app: convite nativo (Android/Chrome) ou passo a passo do iPhone. */
export function InstallHint() {
  const { canPrompt, installed, ios } = useInstallPrompt();
  if (installed) {
    return (
      <p className="flex items-center gap-2.5 text-sm text-mint">
        <CheckCircle2 className="size-5" />
        App instalado neste aparelho.
      </p>
    );
  }
  if (canPrompt) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-steel">Abra direto da tela inicial, em tela cheia, e continue vendo as OMs já abertas mesmo sem sinal.</p>
        <button
          type="button"
          onClick={async () => {
            const ok = await promptInstall();
            if (ok) toast.success("App instalado");
          }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-ice to-ice-deep text-[0.95rem] font-semibold text-abyss"
        >
          <Download className="size-5" />
          Instalar app
        </button>
      </div>
    );
  }
  if (ios) {
    return (
      <ol className="space-y-2.5 text-sm text-steel">
        <li className="flex items-center gap-2.5">
          <span className="readout grid size-6 shrink-0 place-items-center rounded-full bg-ice/12 text-xs text-ice">1</span>
          <span>
            No Safari, toque em <Share className="inline size-4 align-text-bottom text-ice" /> <span className="text-silver">Compartilhar</span>.
          </span>
        </li>
        <li className="flex items-center gap-2.5">
          <span className="readout grid size-6 shrink-0 place-items-center rounded-full bg-ice/12 text-xs text-ice">2</span>
          <span>
            Escolha <SquarePlus className="inline size-4 align-text-bottom text-ice" /> <span className="text-silver">Adicionar à Tela de Início</span>.
          </span>
        </li>
        <li className="flex items-center gap-2.5">
          <span className="readout grid size-6 shrink-0 place-items-center rounded-full bg-ice/12 text-xs text-ice">3</span>
          <span>Abra o Imperium pelo ícone novo.</span>
        </li>
      </ol>
    );
  }
  return (
    <p className="text-sm text-steel">
      No Chrome do Android, abra o menu <span className="text-silver">⋮</span> e toque em <span className="text-silver">Instalar app</span> (ou{" "}
      <span className="text-silver">Adicionar à tela inicial</span>).
    </p>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const left = getOutboxItems().length;
        if (left && !window.confirm(`Há ${left === 1 ? "1 alteração" : `${left} alterações`} ainda não enviada(s). Elas ficam guardadas neste aparelho e são enviadas quando você entrar de novo. Sair mesmo assim?`)) {
          return;
        }
        setPending(true);
        try {
          await authClient.signOut();
          router.replace("/login");
          router.refresh();
        } catch {
          setPending(false);
          toast.error("Não foi possível sair. Confira a conexão e tente de novo.");
        }
      }}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[0.95rem] font-medium text-gauge-red ring-1 ring-gauge-red/30 active:bg-gauge-red/10 disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-5 animate-spin" /> : <LogOut className="size-5" />}
      Sair
    </button>
  );
}
