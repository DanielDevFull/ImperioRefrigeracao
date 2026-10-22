import type { Metadata } from "next";
import Link from "next/link";
import { QrCode as QrIcon } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { QrCode } from "@/components/system/qr-code";
import { Button } from "@/components/ui/button";
import { formatEquipmentCode, formatPhone } from "@/lib/format";
import { param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { getSettings } from "@/server/settings";
import { equipmentForLabels } from "../_lib/queries";
import { PrintButton } from "./_components/print-button";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Etiquetas QR" };

type Format = "grande" | "compacta";
const FORMATS: Record<Format, { perSheet: number; label: string; hint: string }> = {
  grande: { perSheet: 10, label: "Grande (2 × 5)", hint: "95 × 53 mm, 10 por folha" },
  compacta: { perSheet: 21, label: "Compacta (3 × 7)", hint: "63,5 × 38,1 mm, 21 por folha" },
};

/*
 * Medidas reais em mm para A4 (210 × 297):
 * grande   → margens 10/8 mm, 2 colunas de 95 mm (4 mm entre elas), 5 linhas de 53 mm (3 mm entre elas).
 * compacta → padrão de folha 3 × 7 (63,5 × 38,1 mm): margens 15,15/7,25 mm, 2,5 mm entre colunas.
 */
const PRINT_CSS = `
@page { size: A4; margin: 0; }
.label-sheet { width: 210mm; height: 297mm; background: #fff; color: #0a1428; box-sizing: border-box; display: grid; }
.label-sheet[data-format="grande"] { padding: 10mm 8mm; grid-template-columns: repeat(2, 95mm); grid-auto-rows: 53mm; column-gap: 4mm; row-gap: 3mm; align-content: start; }
.label-sheet[data-format="compacta"] { padding: 15.15mm 7.25mm; grid-template-columns: repeat(3, 63.5mm); grid-auto-rows: 38.1mm; column-gap: 2.5mm; align-content: start; }
.qr-label { box-sizing: border-box; overflow: hidden; border-radius: 3mm; border: 0.25mm solid #c9d6e6; background: #fff; }
@media screen and (max-width: 640px) { .label-sheet { zoom: 0.44; } }
@media screen and (min-width: 641px) and (max-width: 900px) { .label-sheet { zoom: 0.8; } }
@media print {
  aside, header, .no-print { display: none !important; }
  html, body { background: #fff !important; }
  main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  div:has(> aside) { padding-left: 0 !important; }
  .sheets { gap: 0 !important; padding: 0 !important; overflow: visible !important; }
  .label-sheet { zoom: 1 !important; box-shadow: none !important; break-after: page; }
  .label-sheet:last-child { break-after: auto; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export default async function EtiquetasPage({ searchParams }: PageProps<"/admin/equipamentos/etiquetas">) {
  await requireStaff();
  const sp = await searchParams;
  const ids = (param(sp, "ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const customerId = param(sp, "customerId");
  const format: Format = param(sp, "formato") === "compacta" ? "compacta" : "grande";
  const [items, settings] = await Promise.all([equipmentForLabels({ ids, customerId }), getSettings()]);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const contact = settings.whatsapp ?? settings.phone;
  const per = FORMATS[format].perSheet;
  const sheets = Array.from({ length: Math.ceil(items.length / per) }, (_, i) => items.slice(i * per, (i + 1) * per));

  const linkFor = (f: Format) => {
    const q = new URLSearchParams();
    if (ids.length) q.set("ids", ids.join(","));
    if (customerId) q.set("customerId", customerId);
    if (f === "compacta") q.set("formato", "compacta");
    return `/admin/equipamentos/etiquetas?${q}`;
  };

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="no-print">
        <PageHeader
          back={{ href: "/admin/equipamentos", label: "Equipamentos" }}
          title="Etiquetas QR"
          description={
            items.length
              ? `${items.length} ${items.length === 1 ? "etiqueta" : "etiquetas"} em ${sheets.length} ${sheets.length === 1 ? "folha" : "folhas"} A4. Imprima em escala 100% (sem “ajustar à página”).`
              : "Selecione equipamentos na lista para montar a folha de etiquetas."
          }
          actions={
            items.length > 0 && (
              <>
                <div className="flex gap-1 rounded-xl bg-night/60 p-1 ring-1 ring-rime" role="group" aria-label="Formato da etiqueta">
                  {(Object.keys(FORMATS) as Format[]).map((f) => (
                    <Link
                      key={f}
                      href={linkFor(f)}
                      replace
                      aria-current={format === f ? "true" : undefined}
                      title={FORMATS[f].hint}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm transition-colors",
                        format === f ? "bg-ice/15 text-silver ring-1 ring-ice/30" : "text-steel hover:text-silver",
                      )}
                    >
                      {FORMATS[f].label}
                    </Link>
                  ))}
                </div>
                <PrintButton />
              </>
            )
          }
        />
      </div>

      {items.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<QrIcon className="size-6 text-frost" />}
            title="Nenhum equipamento selecionado"
            description="Marque os aparelhos na lista de equipamentos e use “Imprimir etiquetas”, ou abra a partir da ficha do cliente."
            action={
              <Button asChild>
                <Link href="/admin/equipamentos">Escolher equipamentos</Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="sheets -mx-4 flex flex-col items-center gap-8 overflow-x-auto px-4 pb-10 md:mx-0 md:px-0">
          {sheets.map((sheet, si) => (
            <div key={si} className="label-sheet shadow-[0_30px_60px_-20px_rgb(0_0_0/0.7)]" data-format={format}>
              {sheet.map((e) => (
                <Label
                  key={e.id}
                  format={format}
                  url={`${appUrl}/e/${e.qrToken}`}
                  code={formatEquipmentCode(e.code)}
                  title={[e.typeName, e.location].filter(Boolean).join(", ") || [e.brand, e.model].filter(Boolean).join(" ") || "Equipamento"}
                  customer={e.customerTradeName || e.customerName}
                  contact={contact ? formatPhone(contact) : null}
                  company={settings.companyName}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Label({
  format,
  url,
  code,
  title,
  customer,
  contact,
  company,
}: {
  format: Format;
  url: string;
  code: string;
  title: string;
  customer: string;
  contact: string | null;
  company: string;
}) {
  if (format === "compacta") {
    return (
      <div className="qr-label flex items-center gap-[2mm] p-[2.2mm]">
        <div className="size-[27mm] shrink-0">
          <QrCode value={url} size={102} className="!h-full !w-full rounded-none" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch py-[0.5mm]">
          <div className="flex items-center gap-[1mm]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/emblem-128.webp" alt="" className="size-[4.5mm] shrink-0 rounded-full" />
            <span className="text-[5.2pt] font-semibold leading-[1.1] text-[#0f2a52]">{company}</span>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[9pt] font-bold leading-none tracking-wide text-[#040914]">{code}</p>
            <p className="mt-[0.6mm] truncate text-[6pt] leading-tight text-[#1b2f4f]">{title}</p>
            <p className="truncate text-[6pt] font-medium leading-tight text-[#1b2f4f]">{customer}</p>
          </div>
          <div>
            <p className="text-[4.8pt] leading-tight text-[#4a5d7a]">Escaneie para ver o histórico ou pedir atendimento</p>
            {contact && <p className="text-[5.5pt] font-semibold leading-tight text-[#1677d6]">WhatsApp {contact}</p>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="qr-label flex flex-col">
      <div className="flex items-center gap-[2mm] border-b-[0.6mm] border-[#38a8ff] bg-[#040914] px-[3.5mm] py-[1.8mm]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/emblem-128.webp" alt="" className="size-[6.5mm] rounded-full" />
        <span className="font-display text-[8.5pt] font-bold leading-none tracking-[0.06em] text-[#e6edf5]">{company}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-[3.5mm] px-[3.5mm] py-[2.5mm]">
        <div className="size-[32mm] shrink-0">
          <QrCode value={url} size={125} className="!h-full !w-full rounded-none" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
          <div className="min-w-0">
            <p className="font-mono text-[13pt] font-bold leading-none tracking-wide text-[#040914]">{code}</p>
            <p className="mt-[2mm] line-clamp-2 text-[8.5pt] leading-snug text-[#1b2f4f]">{title}</p>
            <p className="mt-[0.8mm] line-clamp-2 text-[8.5pt] font-semibold leading-snug text-[#0a1428]">{customer}</p>
          </div>
          <div>
            <p className="text-[7pt] leading-snug text-[#4a5d7a]">Escaneie para ver o histórico ou pedir atendimento</p>
            {contact && <p className="mt-[0.8mm] text-[8pt] font-semibold leading-none text-[#1677d6]">WhatsApp {contact}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
