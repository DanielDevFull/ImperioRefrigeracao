"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, WifiOff } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";

export default function TechError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOffline(!navigator.onLine), 0);
    console.error(error);
    return () => clearTimeout(t);
  }, [error]);
  return (
    <div className="panel mt-6">
      <EmptyState
        icon={offline ? <WifiOff className="size-6 text-brass" /> : undefined}
        title={offline ? "Sem conexão para abrir esta tela" : "Não foi possível carregar esta tela"}
        description={
          offline
            ? "As OMs que você já abriu continuam disponíveis. O que você marcar fica guardado e é enviado quando a internet voltar."
            : "Tente de novo em instantes. Se continuar, avise o escritório."
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-ice to-ice-deep px-4 text-sm font-semibold text-abyss"
            >
              <RefreshCw className="size-4" />
              Tentar de novo
            </button>
            <Link href="/tecnico" className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-medium text-ice ring-1 ring-ice/30">
              Voltar para Hoje
            </Link>
          </div>
        }
      />
    </div>
  );
}
