import { WifiOff } from "lucide-react";
import { Emblem } from "@/components/brand/emblem";

export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-xs">
        <Emblem size={96} halo />
        <h1 className="font-display text-silver-brushed mt-6 text-xl font-semibold">Sem conexão</h1>
        <p className="mt-2 text-sm text-steel">
          As OMs que você já abriu continuam disponíveis. O que for registrado offline é enviado quando a internet voltar.
        </p>
        <WifiOff className="mx-auto mt-6 size-5 text-steel" />
      </div>
    </main>
  );
}
