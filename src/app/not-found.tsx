import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Emblem } from "@/components/brand/emblem";
import { EmptyState } from "@/components/system/empty-state";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página não encontrada" };

/**
 * 404 geral: endereços que não existem e `notFound()` sem um not-found mais próximo.
 * Fica fora dos painéis (admin, portal, técnico têm o próprio, dentro do layout deles).
 * "/" manda cada perfil para a sua tela inicial (ou para o login).
 */
export default function PaginaNaoEncontrada() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "radial-gradient(70% 50% at 50% 20%, color-mix(in srgb, var(--haze-deep) 73.33%, transparent), transparent 70%)" }}
      />
      <div className="relative w-full max-w-md">
        <Emblem size={72} halo priority className="mx-auto mb-6 grid" />
        <Panel>
          <EmptyState
            className="py-10"
            icon={<SearchX className="size-6 text-frost" />}
            title="Página não encontrada"
            description="O link pode estar incompleto ou o registro foi excluído. Volte ao início e procure pelo menu."
            action={
              <Button asChild>
                <Link href="/">Voltar ao início</Link>
              </Button>
            }
          />
        </Panel>
      </div>
    </main>
  );
}
