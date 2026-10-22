import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";

/** Registro inexistente em qualquer tela do back-office (o menu lateral continua visível). */
export default function AdminNaoEncontrado() {
  return (
    <Panel className="mx-auto mt-10 max-w-xl">
      <EmptyState
        icon={<SearchX className="size-6 text-frost" />}
        title="Página não encontrada"
        description="O link pode estar incompleto ou o registro foi excluído. Procure pelo menu ou volte ao painel."
        action={
          <Button asChild>
            <Link href="/admin">Voltar ao painel</Link>
          </Button>
        }
      />
    </Panel>
  );
}
