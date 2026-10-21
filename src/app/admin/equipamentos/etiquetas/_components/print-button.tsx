"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ disabled }: { disabled?: boolean }) {
  return (
    <Button size="lg" onClick={() => window.print()} disabled={disabled} className="no-print">
      <Printer />
      Imprimir
    </Button>
  );
}
