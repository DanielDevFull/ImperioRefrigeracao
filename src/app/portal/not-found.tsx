import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";

/** Registro inexistente (ou de outro cliente) no portal; o menu do portal continua visível. */
export default function PortalNaoEncontrado() {
  return (
    <Panel className="mx-auto mt-10 max-w-xl">
      <EmptyState
        icon={<SearchX className="size-6 text-frost" />}
        title="Página não encontrada"
        description="O link pode estar incompleto ou este registro não está mais disponível na sua conta. Se precisar, fale com a Imperium."
        action={
          <Button asChild>
            <Link href="/portal">Voltar ao início</Link>
          </Button>
        }
      />
    </Panel>
  );
}
