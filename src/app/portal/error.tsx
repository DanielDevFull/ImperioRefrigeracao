"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";

/** Erro inesperado no portal do cliente: o menu do portal continua visível. */
export default function PortalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Panel className="mx-auto mt-10 max-w-xl">
      <EmptyState
        icon={<TriangleAlert className="size-6 text-brass" />}
        title="Não foi possível carregar esta página"
        description="Pode ter sido uma falha passageira de conexão. Tente de novo em instantes; se continuar, fale com a Imperium."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => retry()}>
              <RefreshCw />
              Tentar de novo
            </Button>
            <Button asChild variant="outline">
              <Link href="/portal">Voltar ao início</Link>
            </Button>
          </div>
        }
      />
    </Panel>
  );
}
