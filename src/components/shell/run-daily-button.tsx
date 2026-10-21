"use client";

import { useTransition } from "react";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runDailyNow } from "./staff-actions";

/** Executa agora a rotina diária (mensalidades, OMs preventivas e reposição). */
export function RunDailyButton() {
  const [pending, start] = useTransition();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="hidden text-steel hover:text-frost md:inline-flex"
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
          <RefreshCcw className={pending ? "size-4 animate-spin" : "size-4"} />
          Gerar OMs e mensalidades
        </Button>
      </TooltipTrigger>
      <TooltipContent>Roda agora a rotina que também acontece todo dia às 6h</TooltipContent>
    </Tooltip>
  );
}
