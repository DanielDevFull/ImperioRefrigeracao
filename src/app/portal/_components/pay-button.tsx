import type { receivables } from "@/db/schema";
import { QrCode } from "@/components/system/qr-code";
import type { Settings } from "@/server/settings";
import { buildPayData } from "../_lib/pay";
import { PaySheet } from "./pay-sheet";

/** Botão "Pagar com Pix" com o QR já gerado no servidor. */
export async function PayButton({
  receivable,
  settings,
  label,
  variant,
  className,
}: {
  receivable: typeof receivables.$inferSelect;
  settings: Settings;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
}) {
  const data = await buildPayData(receivable, settings);
  const qr = data.pixCode && data.status !== "em_analise" ? <QrCode value={data.pixCode} size={208} /> : null;
  return <PaySheet data={data} qr={qr} triggerLabel={label} triggerVariant={variant} triggerClassName={className} />;
}
