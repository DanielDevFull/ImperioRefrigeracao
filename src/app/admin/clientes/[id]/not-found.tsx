import Link from "next/link";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";

export default function ClienteNaoEncontrado() {
  return (
    <Panel className="mx-auto mt-10 max-w-xl">
      <EmptyState
        icon={<Users className="size-6 text-frost" />}
        title="Cliente não encontrado"
        description="O link pode estar incompleto ou o cadastro foi excluído. Procure o cliente pela lista."
        action={
          <Button asChild>
            <Link href="/admin/clientes">Ver clientes</Link>
          </Button>
        }
      />
    </Panel>
  );
}
