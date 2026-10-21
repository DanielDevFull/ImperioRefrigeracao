"use client";

import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Imprime a página (a folha de estilo de impressão da tela decide o que aparece). */
export function PrintButton({ label = "Imprimir", className, variant = "outline" }: { label?: string; className?: string; variant?: "outline" | "default" | "ghost" }) {
  return (
    <Button type="button" variant={variant} size="lg" className={className} onClick={() => window.print()}>
      <Printer /> {label}
    </Button>
  );
}

/** Baixa o QR (SVG gerado no servidor) que está dentro do elemento `targetId`. */
export function DownloadQrButton({ targetId, fileName, className }: { targetId: string; fileName: string; className?: string }) {
  function download() {
    const svg = document.getElementById(targetId)?.querySelector("svg");
    if (!svg) {
      toast.error("Não encontramos o QR na tela. Atualize a página e tente de novo.");
      return;
    }
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("QR baixado");
  }
  return (
    <Button type="button" variant="outline" size="lg" className={className} onClick={download}>
      <Download /> Baixar QR
    </Button>
  );
}
