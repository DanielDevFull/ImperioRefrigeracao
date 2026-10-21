import Link from "next/link";
import { EmptyState } from "@/components/system/empty-state";

export default function TechWorkOrderNotFound() {
  return (
    <div className="panel mt-6">
      <EmptyState
        title="OM não encontrada"
        description="Ela pode ter sido reatribuída a outro técnico ou cancelada pelo escritório."
        action={
          <Link href="/tecnico" className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-medium text-ice ring-1 ring-ice/30">
            Voltar para Hoje
          </Link>
        }
      />
    </div>
  );
}
