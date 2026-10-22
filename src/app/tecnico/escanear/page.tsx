import type { Metadata } from "next";
import { PageHeader } from "@/components/system/page-header";
import { requireTechnician } from "@/lib/auth/session";
import { Scanner } from "./_components/scanner";

export const metadata: Metadata = { title: "Escanear" };

export default async function TechScanPage() {
  await requireTechnician();
  return (
    <div>
      <PageHeader title="Escanear" description="Leia a etiqueta QR para abrir a ficha do aparelho." className="mb-4" />
      <Scanner />
    </div>
  );
}
