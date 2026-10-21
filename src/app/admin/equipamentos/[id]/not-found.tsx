import Link from "next/link";
import { AirVent } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";

export default function EquipamentoNaoEncontrado() {
  return (
    <Panel className="mx-auto mt-10 max-w-xl">
      <EmptyState
        icon={<AirVent className="size-6 text-frost" />}
        title="Equipamento não encontrado"
        description="O link pode estar incompleto ou o cadastro foi excluído. Procure o aparelho pela lista."
        action={
          <Button asChild>
            <Link href="/admin/equipamentos">Ver equipamentos</Link>
          </Button>
        }
      />
    </Panel>
  );
}
