"use client";

import { useTransition } from "react";
import { CalendarSync, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateInvoicesNow } from "../actions";

/** Gera agora as mensalidades dos contratos ativos (o mesmo que a rotina diária faz). */
export function GenerateInvoicesButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await generateInvoicesNow();
          if (r.ok === false || r.error) toast.error(r.error ?? "Não foi possível gerar as mensalidades. Tente novamente.");
          else toast.success(r.message ?? "Mensalidades geradas");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <CalendarSync />}
      Gerar mensalidades agora
    </Button>
  );
}
