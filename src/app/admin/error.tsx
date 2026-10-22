"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";

/** Erro inesperado numa tela do back-office: o menu lateral continua visível. */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <Panel className="mx-auto mt-10 max-w-xl">
      <EmptyState
        icon={<TriangleAlert className="size-6 text-brass" />}
        title="Não foi possível carregar esta tela"
        description="Pode ter sido uma falha passageira de conexão com o servidor. Tente de novo; se continuar, avise o suporte."
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => retry()}>
                <RefreshCw />
                Tentar de novo
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin">Voltar ao painel</Link>
              </Button>
            </div>
            {digest && <p className="readout text-xs text-steel/80 light:text-steel">Código do erro: {digest}</p>}
          </div>
        }
      />
    </Panel>
  );
}
