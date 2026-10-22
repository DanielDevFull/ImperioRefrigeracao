import Link from "next/link";
import { EmptyState } from "@/components/system/empty-state";

/** Página inexistente no app do técnico (OM e equipamento têm mensagens próprias). */
export default function TechNotFound() {
  return (
    <div className="panel mt-6">
      <EmptyState
        title="Página não encontrada"
        description="O link pode estar incompleto ou o registro foi excluído. Volte para a sua agenda de hoje."
        action={
          <Link href="/tecnico" className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-medium text-ice ring-1 ring-ice/30">
            Voltar para Hoje
          </Link>
        }
      />
    </div>
  );
}
