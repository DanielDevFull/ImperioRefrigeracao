"use client";

import { useTransition } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runDailyFromSettings } from "../actions";

/** Executa a rotina diária agora (mensalidades, OMs preventivas e reposição de estoque). */
export function RunNowButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runDailyFromSettings();
          if (r.ok) toast.success("Rotina executada", { description: r.message?.replace(/^Rotina executada: /, "") });
          else toast.error(r.error ?? "A rotina falhou.");
        })
      }
    >
      <Play className={pending ? "size-4 animate-pulse" : "size-4"} />
      {pending ? "Rodando…" : "Rodar agora"}
    </Button>
  );
}
