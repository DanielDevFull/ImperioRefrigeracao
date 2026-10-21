"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button className="h-9" onClick={() => window.print()}>
      <Printer className="size-4" />
      Imprimir / Salvar PDF
    </Button>
  );
}
