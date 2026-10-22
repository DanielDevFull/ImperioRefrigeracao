import Link from "next/link";
import { MessageCircle, QrCode } from "lucide-react";
import { Emblem } from "@/components/brand/emblem";
import { SnowField } from "@/components/brand/snow-field";
import { Button } from "@/components/ui/button";
import { formatPhone, whatsappLink } from "@/lib/format";
import { getSettings } from "@/server/settings";

export default async function EtiquetaNaoEncontrada() {
  const settings = await getSettings();
  const contact = settings.whatsapp ?? settings.phone;
  const wa = whatsappLink(contact, "Olá! Escaneei uma etiqueta de equipamento da Imperium, mas ela não abriu. Podem me ajudar?");
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-12">
      <div aria-hidden className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(70% 50% at 50% 25%, var(--haze-deep), transparent 70%)" }}
        />
        <SnowField density="whisper" />
      </div>
      <div className="relative w-full max-w-sm text-center">
        <Emblem size={84} halo priority className="mx-auto" />
        <div className="mx-auto mt-8 grid size-12 place-items-center rounded-full bg-ice/10 ring-1 ring-ice/25">
          <QrCode className="size-5 text-ice" />
        </div>
        <h1 className="font-display text-silver-brushed mt-4 text-2xl font-semibold">Etiqueta não encontrada</h1>
        <p className="mt-2 text-sm text-steel">
          Este QR não está ativo. A etiqueta pode ter sido substituída por uma nova. Fale com a Imperium para conferir o
          equipamento ou pedir atendimento.
        </p>
        <div className="mt-7 space-y-2.5">
          {wa && (
            <Button asChild size="lg" className="h-12 w-full">
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle />
                Falar pelo WhatsApp
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="lg" className="h-12 w-full">
            <Link href="/login">Entrar no sistema</Link>
          </Button>
        </div>
        <p className="mt-8 text-xs text-steel">
          {settings.companyName}
          {contact ? `, WhatsApp ${formatPhone(contact)}` : ""}
        </p>
      </div>
    </main>
  );
}
