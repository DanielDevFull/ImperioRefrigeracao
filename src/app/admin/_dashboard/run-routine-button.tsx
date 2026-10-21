"use client";

import { useTransition } from "react";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runDailyNow } from "@/components/shell/staff-actions";

/** Roda a rotina diária agora (o mesmo do botão do topo, visível também no celular). */
export function RunRoutineButton({ className }: { className?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runDailyNow();
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success("Rotina executada", {
            description: `${r.summary.oms} OM(s), ${r.summary.mensalidades} mensalidade(s) e ${r.summary.solicitacoesCompra} solicitação(ões) de compra geradas.`,
          });
        })
      }
    >
      <RefreshCcw className={pending ? "animate-spin" : undefined} />
      {pending ? "Rodando rotina…" : "Rodar rotina agora"}
    </Button>
  );
}
