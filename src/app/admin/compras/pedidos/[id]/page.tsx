import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/system/confirm-action";
import { PageHeader } from "@/components/system/page-header";
import { DetailList, Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { PayableStatusBadge, PurchaseOrderStatusBadge, PurchaseRequestStatusBadge } from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { addDays, todayISO } from "@/lib/dates";
import { formatBRL, formatDate, formatDateTime, formatDocument, formatPO, formatPhone } from "@/lib/format";
import { effectiveFinanceStatus, labelOf, purchaseRequestReason } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getSettings } from "@/server/settings";
import { ToastOnArrival } from "../../../estoque/_components/param-controls";
import { listActiveLocations, listProductOptions, listSupplierOptions } from "../../../estoque/_lib/queries";
import { formatQty } from "../../../estoque/_lib/stock-format";
import { getPurchaseOrder } from "../../_lib/queries";
import { orderWhatsappLink } from "../../_lib/order-text";
import { cancelOrder, reopenOrder, sendOrder } from "./actions";
import { OrderDetailsDialog } from "./_components/details-dialog";
import { OrderItems, type ItemRow } from "./_components/order-items";
import { ReceiveDialog } from "./_components/receive-dialog";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/admin/compras/pedidos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const order = /^[0-9a-f-]{36}$/i.test(id) ? await getPurchaseOrder(id) : null;
  return { title: order ? formatPO(order.number) : "Pedido de compra" };
}

export default async function PedidoPage({ params }: PageProps<"/admin/compras/pedidos/[id]">) {
  await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await getPurchaseOrder(id);
  if (!order) notFound();
  const today = todayISO();
  const [settings, suppliers, locations, products] = await Promise.all([
    getSettings(),
    listSupplierOptions(),
    listActiveLocations(),
    order.status === "rascunho" ? listProductOptions() : Promise.resolve([]),
  ]);

  const items: ItemRow[] = order.items.map((i) => ({
    id: i.id,
    productId: i.productId,
    name: i.product.name,
    sku: i.product.sku,
    unit: i.product.unit,
    quantity: i.quantity,
    unitCost: i.unitCost,
    receivedQuantity: i.receivedQuantity,
  }));
  // andamento do recebimento pelo valor (unidades diferentes não se somam)
  const orderedValue = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const receivedValue = items.reduce((s, i) => s + Math.min(i.receivedQuantity, i.quantity) * i.unitCost, 0);
  const receivedRatio =
    orderedValue > 0
      ? receivedValue / orderedValue
      : items.length && items.every((i) => i.receivedQuantity >= i.quantity)
        ? 1
        : 0;
  const anyReceived = items.some((i) => i.receivedQuantity > 0);
  const draft = order.status === "rascunho";
  const receivable = order.status === "enviado" || order.status === "recebido_parcial";
  const cancellable = (order.status === "rascunho" || order.status === "enviado") && !anyReceived;
  const closed = order.status === "recebido" || order.status === "cancelado";
  const address = [settings.address, [settings.city, settings.state].filter(Boolean).join("/")].filter(Boolean).join(", ");
  const wa = order.supplier ? orderWhatsappLink(order, settings.companyName, address) : null;
  const late = receivable && order.expectedDate && order.expectedDate < today;
  const payableStatus = order.payable ? effectiveFinanceStatus(order.payable.status, order.payable.dueDate, today) : null;

  return (
    <>
      <ToastOnArrival param="criado" message="Pedido criado" />
      <PageHeader
        back={{ href: "/admin/compras", label: "Compras" }}
        title={<span className="tabular-nums">{formatPO(order.number)}</span>}
        description={order.supplier ? `Pedido de compra para ${order.supplier.name}.` : "Pedido de compra sem fornecedor definido."}
        meta={
          <>
            <PurchaseOrderStatusBadge status={order.status} />
            {late && <ToneBadge tone="red">Entrega atrasada</ToneBadge>}
            <span className="text-xs text-steel">
              Criado em {formatDateTime(order.createdAt)}
              {order.createdByName ? ` por ${order.createdByName}` : ""}
            </span>
          </>
        }
        actions={
          <>
            {wa && !closed && (
              <Button variant="outline" asChild>
                <a href={wa} target="_blank" rel="noreferrer">
                  <MessageCircle />
                  Enviar pelo WhatsApp
                </a>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/admin/compras/pedidos/${order.id}/imprimir`}>
                <Printer />
                Imprimir
              </Link>
            </Button>
            {cancellable && (
              <ConfirmAction
                action={cancelOrder.bind(null, order.id)}
                title={`Cancelar ${formatPO(order.number)}?`}
                description="O pedido fica registrado como cancelado e as solicitações ligadas a ele voltam para a fila de compras."
                confirmLabel="Cancelar pedido"
                destructive
                variant="ghost"
                size="default"
              >
                Cancelar pedido
              </ConfirmAction>
            )}
            {order.status === "enviado" && !anyReceived && (
              <ConfirmAction
                action={reopenOrder.bind(null, order.id)}
                title="Reabrir para edição?"
                description="O pedido volta a rascunho para você ajustar itens e custos. Avise o fornecedor sobre a mudança."
                confirmLabel="Reabrir pedido"
                variant="outline"
                size="default"
              >
                Reabrir para edição
              </ConfirmAction>
            )}
            {draft && (
              <ConfirmAction
                action={sendOrder.bind(null, order.id)}
                title={`Marcar ${formatPO(order.number)} como enviado?`}
                description={
                  items.length
                    ? `Os itens ficam travados e a data do pedido passa a ser hoje. Total ${formatBRL(order.total + order.freight)}.`
                    : "Adicione pelo menos um item antes de enviar."
                }
                confirmLabel="Marcar como enviado"
                variant="default"
                size="default"
              >
                Marcar como enviado
              </ConfirmAction>
            )}
            {receivable && (
              <ReceiveDialog
                orderId={order.id}
                items={items}
                locations={locations}
                defaultLocationId={order.locationId && locations.some((l) => l.id === order.locationId) ? order.locationId : (locations.find((l) => l.type === "almoxarifado")?.id ?? locations[0]?.id ?? "")}
                needsPayable={!order.payableId}
                payableAmount={order.total + order.freight}
                defaultDueDate={addDays(today, 28)}
              />
            )}
          </>
        }
      />

      <OrderTimeline order={order} />

      <ReadoutBand
        className="mb-6"
        items={[
          { label: "Total do pedido", value: order.total + order.freight, format: "brl", hint: order.freight ? `com ${formatBRL(order.freight)} de frete` : "sem frete" },
          { label: "Itens", value: items.length, hint: items.length === 1 ? "produto" : "produtos" },
          {
            label: "Recebido",
            value: receivedRatio,
            format: "percent",
            tone: receivedRatio >= 1 ? "mint" : receivedRatio > 0 ? "brass" : undefined,
            hint: order.receivedAt ? `concluído em ${formatDate(order.receivedAt)}` : anyReceived ? "do valor, em parte" : "nada ainda",
          },
          {
            label: "Conta a pagar",
            value: order.payable?.amount ?? 0,
            format: "brl",
            tone: payableStatus === "pago" ? "mint" : payableStatus === "vencido" ? "red" : undefined,
            hint: order.payable ? `vence em ${formatDate(order.payable.dueDate)}` : "lançada no recebimento",
            href: order.payable ? "/admin/financeiro/pagar" : undefined,
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Panel
            flush
            title="Itens"
            description={draft ? "Ajuste quantidades e custos; cada linha salva separadamente." : receivable ? "Recebido até agora por item." : undefined}
          >
            <OrderItems
              orderId={order.id}
              items={items}
              editable={draft}
              products={products}
              freight={order.freight}
              total={order.total}
            />
          </Panel>

          {order.requests.length > 0 && (
            <Panel flush title="Solicitações neste pedido" description="Viram atendidas quando o pedido é recebido por completo.">
              <ul className="divide-y divide-rime">
                {order.requests.map((r) => {
                  const reason = labelOf(purchaseRequestReason, r.reason);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 text-sm">
                      <Link href={`/admin/estoque/${r.productId}`} className="w-full min-w-0 truncate text-silver hover:text-frost sm:w-auto sm:flex-1">
                        {r.product.name}
                      </Link>
                      <span className="tabular-nums text-steel">{formatQty(r.quantity, r.product.unit)}</span>
                      <ToneBadge tone={reason.tone}>{reason.label}</ToneBadge>
                      {r.workOrderId && (
                        <Link href={`/admin/oms/${r.workOrderId}`} className="text-xs text-frost hover:underline">
                          Ver OM
                        </Link>
                      )}
                      <PurchaseRequestStatusBadge status={r.status} />
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Panel
            title="Fornecedor"
            actions={
              order.supplier && (
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/admin/fornecedores/${order.supplier.id}`}>Ver cadastro</Link>
                </Button>
              )
            }
          >
            {order.supplier ? (
              <DetailList
                columns={1}
                items={[
                  { label: "Nome", value: order.supplier.name },
                  { label: "CNPJ", value: order.supplier.document ? formatDocument(order.supplier.document) : "—" },
                  { label: "Contato", value: order.supplier.contactName ?? "—" },
                  {
                    label: "Telefone",
                    value: order.supplier.phone ? (
                      <a href={`tel:${order.supplier.phone}`} className="hover:text-frost">
                        {formatPhone(order.supplier.phone)}
                      </a>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    label: "E-mail",
                    value: order.supplier.email ? (
                      <a href={`mailto:${order.supplier.email}?subject=${encodeURIComponent(`Pedido de compra ${formatPO(order.number)}`)}`} className="hover:text-frost">
                        {order.supplier.email}
                      </a>
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
            ) : (
              <p className="text-sm text-steel">Defina o fornecedor em Dados do pedido.</p>
            )}
          </Panel>

          <Panel
            title="Dados do pedido"
            actions={
              !closed && (
                <OrderDetailsDialog
                  order={{
                    id: order.id,
                    status: order.status,
                    supplierId: order.supplierId,
                    expectedDate: order.expectedDate,
                    locationId: order.locationId,
                    freight: order.freight,
                    notes: order.notes,
                  }}
                  suppliers={suppliers}
                  locations={locations}
                />
              )
            }
          >
            <DetailList
              columns={1}
              items={[
                { label: "Enviado em", value: formatDate(order.orderDate) },
                {
                  label: "Previsão de entrega",
                  value: <span className={cn(late && "text-gauge-red")}>{formatDate(order.expectedDate)}</span>,
                },
                { label: "Recebido em", value: formatDateTime(order.receivedAt) },
                { label: "Local de recebimento", value: order.location?.name ?? "Almoxarifado principal" },
                { label: "Frete", value: formatBRL(order.freight) },
              ]}
            />
            {order.notes && <p className="mt-4 whitespace-pre-line border-t border-rime pt-4 text-sm text-steel">{order.notes}</p>}
          </Panel>

          <Panel title="Conta a pagar">
            {order.payable ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-silver">{order.payable.description}</p>
                  <PayableStatusBadge status={payableStatus ?? order.payable.status} />
                </div>
                <DetailList
                  columns={2}
                  items={[
                    { label: "Valor", value: <span className="tabular-nums">{formatBRL(order.payable.amount)}</span> },
                    { label: "Vencimento", value: formatDate(order.payable.dueDate) },
                    { label: "Nota fiscal", value: order.payable.documentNumber ?? "—" },
                    { label: "Pago em", value: formatDate(order.payable.paidAt) },
                  ]}
                />
                <Button size="sm" variant="outline" asChild>
                  <Link href="/admin/financeiro/pagar">Abrir contas a pagar</Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-steel">
                {order.status === "cancelado"
                  ? "Pedido cancelado, sem conta a pagar."
                  : `Lançada automaticamente no primeiro recebimento, no valor do pedido com frete (${formatBRL(order.total + order.freight)}).`}
              </p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function OrderTimeline({ order }: { order: NonNullable<Awaited<ReturnType<typeof getPurchaseOrder>>> }) {
  if (order.status === "cancelado")
    return (
      <p className="mb-6 rounded-xl border border-rime bg-night/40 px-4 py-3 text-sm text-steel">
        Pedido cancelado. As solicitações ligadas a ele voltaram para a fila de compras.
      </p>
    );
  const stepIndex = { rascunho: 0, enviado: 1, recebido_parcial: 2, recebido: 3 }[order.status] ?? 0;
  const steps = [
    { label: "Rascunho", date: formatDate(order.createdAt) },
    { label: "Enviado", date: order.orderDate ? formatDate(order.orderDate) : null },
    {
      label: order.status === "recebido_parcial" ? "Recebido em parte" : "Recebido",
      date: order.receivedAt ? formatDate(order.receivedAt) : order.status === "recebido_parcial" ? "pendências" : null,
    },
  ];
  const reached = (i: number) => (i === 2 ? stepIndex >= 2 : stepIndex >= i);
  return (
    <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Andamento do pedido">
      {steps.map((s, i) => (
        <li key={s.label} className="min-w-0">
          <div
            className={cn(
              "h-1 rounded-full",
              reached(i) ? (i === 2 && stepIndex === 2 ? "bg-brass" : i === 2 ? "bg-mint" : "bg-ice") : "bg-ice/10",
            )}
          />
          <p className={cn("mt-2 text-xs sm:truncate", reached(i) ? "text-silver" : "text-steel/70 light:text-steel/90")}>
            {s.label}
            {s.date && <span className="block text-steel sm:ml-1.5 sm:inline">{s.date}</span>}
          </p>
        </li>
      ))}
    </ol>
  );
}

