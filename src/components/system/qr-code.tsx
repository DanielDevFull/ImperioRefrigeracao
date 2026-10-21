import QRCode from "qrcode";
import { cn } from "@/lib/utils";

/** QR code renderizado no servidor como SVG inline (etiquetas de equipamento e Pix). */
export async function QrCode({ value, size = 160, className, light = "#ffffff", dark = "#040914" }: { value: string; size?: number; className?: string; light?: string; dark?: string }) {
  const svg = await QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { light, dark } });
  return (
    <span
      role="img"
      aria-label="QR code"
      className={cn("inline-block overflow-hidden rounded-lg [&>svg]:h-full [&>svg]:w-full", className)}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
