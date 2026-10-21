import Link from "next/link";
import { EmptyState } from "@/components/system/empty-state";

export default function TechEquipmentNotFound() {
  return (
    <div className="panel mt-6">
      <EmptyState
        title="Equipamento não encontrado"
        description="Confira o código da etiqueta ou escaneie o QR de novo."
        action={
          <Link href="/tecnico/escanear" className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-medium text-ice ring-1 ring-ice/30">
            Escanear de novo
          </Link>
        }
      />
    </div>
  );
}
