"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { setTechnicianActive } from "../actions";

/** Liga/desliga o técnico (inativos não recebem OMs automáticas). */
export function ActiveToggle({
  id,
  name,
  active,
  withLabel = false,
  className,
}: {
  id: string;
  name: string;
  active: boolean;
  withLabel?: boolean;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(active);
  return (
    <label className={cn("relative z-10 inline-flex items-center gap-2 text-sm text-steel", className)}>
      <Switch
        checked={value}
        disabled={pending}
        aria-label={value ? `Desativar ${name}` : `Ativar ${name}`}
        onCheckedChange={(checked) =>
          start(async () => {
            setValue(checked);
            const r = await setTechnicianActive(id, checked);
            if (r.ok) toast.success(r.message ?? (checked ? "Técnico ativado" : "Técnico desativado"));
            else toast.error(r.error ?? "Não foi possível alterar o técnico.");
          })
        }
      />
      {withLabel && <span className={value ? "text-silver" : undefined}>{value ? "Ativo" : "Inativo"}</span>}
    </label>
  );
}
