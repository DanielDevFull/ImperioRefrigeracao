import { FileQuestion, MessageCircle } from "lucide-react";
import { Emblem } from "@/components/brand/emblem";
import { SnowField } from "@/components/brand/snow-field";
import { Button } from "@/components/ui/button";
import { formatPhone, whatsappLink } from "@/lib/format";
import { getSettings } from "@/server/settings";

export default async function OrcamentoNaoEncontrado() {
  const settings = await getSettings();
  const contact = settings.whatsapp ?? settings.phone;
  const wa = whatsappLink(contact, "Olá! Recebi um link de orçamento, mas ele não abriu. Podem me ajudar?");
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-12">
      <div aria-hidden className="absolute inset-0">
        <div className="absolute inset-0" style={{ background: "radial-gradient(70% 50% at 50% 25%, var(--haze-deep), transparent 70%)" }} />
        <SnowField density="whisper" />
      </div>
      <div className="relative w-full max-w-sm text-center">
        <Emblem size={84} halo priority className="mx-auto" />
        <div className="mx-auto mt-8 grid size-12 place-items-center rounded-full bg-ice/10 ring-1 ring-ice/25">
          <FileQuestion className="size-5 text-ice" />
        </div>
        <h1 className="font-display text-silver-brushed mt-4 text-2xl font-semibold">Orçamento não encontrado</h1>
        <p className="mt-2 text-sm text-steel">
          Confira se o link chegou completo. Se o problema continuar, fale com a gente que reenviamos o orçamento.
        </p>
        {wa && (
          <Button asChild size="lg" className="mt-7 h-12 w-full">
            <a href={wa} target="_blank" rel="noreferrer">
              <MessageCircle />
              Falar pelo WhatsApp
            </a>
          </Button>
        )}
        <p className="mt-8 text-xs text-steel">
          {settings.companyName}
          {contact ? `, WhatsApp ${formatPhone(contact)}` : ""}
        </p>
      </div>
    </main>
  );
}
