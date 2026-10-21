import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate, formatDocument, formatPO, formatPhone } from "@/lib/format";
import { purchaseOrderStatus } from "@/lib/labels";
import { getSettings } from "@/server/settings";
import { formatQty, round2 } from "../../../../estoque/_lib/stock-format";
import { getPurchaseOrder } from "../../../_lib/queries";
import { orderWhatsappLink } from "../../../_lib/order-text";
import { PrintButton } from "../_components/print-button";

export async function generateMetadata({ params }: PageProps<"/admin/compras/pedidos/[id]/imprimir">): Promise<Metadata> {
  const { id } = await params;
  const order = /^[0-9a-f-]{36}$/i.test(id) ? await getPurchaseOrder(id) : null;
  return { title: order ? `Imprimir ${formatPO(order.number)}` : "Imprimir pedido" };
}

/** Versão para impressão / PDF do pedido, com o cabeçalho da empresa. */
export default async function ImprimirPedidoPage({ params }: PageProps<"/admin/compras/pedidos/[id]/imprimir">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [order, settings] = await Promise.all([getPurchaseOrder(id), getSettings()]);
  if (!order) notFound();
  const address = [settings.address, [settings.city, settings.state].filter(Boolean).join("/")].filter(Boolean).join(", ");
  const wa = order.supplier ? orderWhatsappLink(order, settings.companyName, address) : null;
  const issued = order.orderDate ?? order.createdAt;

  return (
    <>
      {/* Na impressão, só a folha aparece (o menu e a barra do sistema somem) */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body * { visibility: hidden !important; }
          #po-sheet, #po-sheet * { visibility: visible !important; }
          #po-sheet { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
        }
      `}</style>

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/admin/compras/pedidos/${order.id}`}
          className="inline-flex items-center gap-1 text-sm text-steel transition-colors hover:text-frost"
        >
          <ChevronLeft className="size-4" />
          Voltar ao pedido
        </Link>
        <div className="flex flex-wrap gap-2">
          {wa && (
            <Button variant="outline" asChild>
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle />
                Enviar pelo WhatsApp
              </a>
            </Button>
          )}
          <PrintButton />
        </div>
      </div>

      <article
        id="po-sheet"
        className="mx-auto max-w-[210mm] rounded-xl bg-white p-6 text-[13px] leading-relaxed text-slate-800 shadow-2xl sm:p-10"
      >
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <Image src="/brand/emblem-256.webp" alt="" width={56} height={56} className="rounded-full" />
            <div>
              <p className="text-lg font-semibold text-slate-900">{settings.companyName}</p>
              {settings.document && <p className="text-slate-500">CNPJ {formatDocument(settings.document)}</p>}
              {address && <p className="text-slate-500">{address}</p>}
              <p className="text-slate-500">
                {[settings.phone ? formatPhone(settings.phone) : null, settings.email].filter(Boolean).join("  |  ")}
              </p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-sm text-slate-500">Pedido de compra</p>
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatPO(order.number)}</p>
            <p className="text-slate-500">Emitido em {formatDate(issued)}</p>
            {order.status !== "enviado" && (
              <p className="mt-1 text-xs font-medium text-slate-600">Situação: {purchaseOrderStatus[order.status]?.label}</p>
            )}
          </div>
        </header>

        <section className="grid gap-6 border-b border-slate-200 py-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Fornecedor</p>
            {order.supplier ? (
              <>
                <p className="font-medium text-slate-900">{order.supplier.name}</p>
                {order.supplier.document && <p>CNPJ {formatDocument(order.supplier.document)}</p>}
                {order.supplier.contactName && <p>A/C {order.supplier.contactName}</p>}
                <p>{[order.supplier.phone ? formatPhone(order.supplier.phone) : null, order.supplier.email].filter(Boolean).join("  |  ")}</p>
              </>
            ) : (
              <p>Não definido</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Entrega</p>
            <p className="font-medium text-slate-900">{settings.companyName}</p>
            {address && <p>{address}</p>}
            <p>Previsão: {order.expectedDate ? formatDate(order.expectedDate) : "a combinar"}</p>
          </div>
        </section>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs text-slate-500">
              <th className="py-2 pr-2 font-medium">Código</th>
              <th className="py-2 pr-2 font-medium">Descrição</th>
              <th className="py-2 pr-2 text-right font-medium">Quantidade</th>
              <th className="py-2 pr-2 text-right font-medium">Valor unitário</th>
              <th className="py-2 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-2 text-slate-500">{i.product.sku ?? "—"}</td>
                <td className="py-2 pr-2 text-slate-900">{i.product.name}</td>
                <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums">{formatQty(i.quantity, i.product.unit)}</td>
                <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums">{formatBRL(i.unitCost)}</td>
                <td className="whitespace-nowrap py-2 text-right tabular-nums">{formatBRL(round2(i.quantity * i.unitCost))}</td>
              </tr>
            ))}
            {order.items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  Pedido sem itens.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 w-full max-w-64 space-y-1">
          <div className="flex justify-between">
            <dt className="text-slate-500">Itens</dt>
            <dd className="tabular-nums">{formatBRL(order.total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Frete</dt>
            <dd className="tabular-nums">{formatBRL(order.freight)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-300 pt-1.5 text-base font-semibold text-slate-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatBRL(order.total + order.freight)}</dd>
          </div>
        </dl>

        {order.notes && (
          <section className="mt-6 rounded-lg bg-slate-50 p-4">
            <p className="mb-1 text-xs font-medium text-slate-500">Observações</p>
            <p className="whitespace-pre-line">{order.notes}</p>
          </section>
        )}

        <footer className="mt-14 grid gap-10 sm:grid-cols-2">
          <div className="border-t border-slate-400 pt-2 text-center text-xs text-slate-500">
            {order.createdByName ?? settings.companyName}
            <br />
            Comprador
          </div>
          <div className="border-t border-slate-400 pt-2 text-center text-xs text-slate-500">
            {order.supplier?.name ?? "Fornecedor"}
            <br />
            Aceite do fornecedor
          </div>
        </footer>
      </article>
    </>
  );
}
