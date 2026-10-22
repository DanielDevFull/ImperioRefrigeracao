import type { Metadata } from "next";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { ToneBadge } from "@/components/system/tone-badge";
import { db } from "@/db";
import { todayISO } from "@/lib/dates";
import { purchaseOrderStatus } from "@/lib/labels";
import { PAGE_SIZE, pageFrom, param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { materialForecast } from "@/server/stock";
import { listProductOptions, listSupplierOptions } from "../estoque/_lib/queries";
import { formatQty } from "../estoque/_lib/stock-format";
import { NewOrderDialog } from "./_components/order-dialog";
import { OrdersList } from "./_components/orders-list";
import { NewRequestDialog } from "./_components/request-dialog";
import { RequestsTable } from "./_components/requests-table";
import { SuggestionsButton } from "./_components/suggestions-button";
import {
  ORDER_STATUSES,
  getOrderReadouts,
  listOpenRequests,
  listPurchaseOrders,
  orderStatusCounts,
  productsWithOpenRequest,
  type OrderStatus,
} from "./_lib/queries";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Compras" };

const FORECAST_DAYS = 30;

export default async function ComprasPage({ searchParams }: PageProps<"/admin/compras">) {
  await requireStaff();
  const sp = await searchParams;
  const rawStatus = param(sp, "status");
  const status = ORDER_STATUSES.includes(rawStatus as OrderStatus) ? (rawStatus as OrderStatus) : undefined;
  const page = pageFrom(sp);
  const today = todayISO();

  const [requests, forecast, readouts, orders, counts, suppliers, productOptions, requested] = await Promise.all([
    listOpenRequests(),
    materialForecast(db, FORECAST_DAYS, today),
    getOrderReadouts(),
    listPurchaseOrders({ status, page }),
    orderStatusCounts(),
    listSupplierOptions(),
    listProductOptions(),
    productsWithOpenRequest(),
  ]);
  const openRequests = requests.filter((r) => r.status === "aberta").length;
  const shortages = forecast.filter((f) => f.shortage > 0);
  const uncovered = shortages.filter((f) => !requested.has(f.productId)).length;

  return (
    <>
      <PageHeader
        title="Compras"
        description="Do que falta ao que chegou: solicitações viram pedidos para o fornecedor, e o recebimento dá entrada no estoque e lança a conta a pagar."
        actions={
          <>
            <SuggestionsButton />
            <NewRequestDialog products={productOptions} />
            <NewOrderDialog suppliers={suppliers} />
          </>
        }
      />

      <ReadoutBand
        className="mb-8"
        items={[
          {
            label: "Solicitações abertas",
            value: openRequests,
            tone: openRequests > 0 ? "brass" : undefined,
            hint: openRequests > 0 ? "aguardando pedido" : "fila vazia",
          },
          {
            label: `Faltas previstas em ${FORECAST_DAYS} dias`,
            value: shortages.length,
            tone: uncovered > 0 ? "red" : shortages.length > 0 ? "brass" : "mint",
            hint: uncovered > 0 ? `${uncovered} sem solicitação` : shortages.length ? "todas solicitadas" : "materiais cobertos",
          },
          {
            label: "Pedidos em andamento",
            value: readouts.inProgress,
            tone: readouts.late > 0 ? "red" : undefined,
            hint: readouts.late > 0 ? `${readouts.late} com entrega atrasada` : `${readouts.drafts} em rascunho`,
            href: "/admin/compras?status=enviado#pedidos",
          },
          { label: "Valor em pedidos abertos", value: readouts.openValue, format: "brl", hint: "itens + frete" },
        ]}
      />

      <div className="space-y-6">
        <Panel
          flush
          title="Solicitações de compra"
          description="Abertas pelo estoque mínimo, pela falta de material em OM ou à mão. Junte várias em um pedido."
        >
          {requests.length ? (
            <RequestsTable requests={requests} suppliers={suppliers} />
          ) : (
            <EmptyState
              title="Nenhuma solicitação aberta"
              description="Quando um produto cair abaixo do mínimo ou faltar material para as OMs agendadas, a necessidade aparece aqui."
              action={<SuggestionsButton />}
            />
          )}
        </Panel>

        <section id="pedidos" className="scroll-mt-24">
          <Panel flush title="Pedidos de compra" description="Rascunho, enviado ao fornecedor, recebido em partes ou por completo.">
            <div className="border-b border-rime p-4">
              <FilterTabs
                className="w-full flex-nowrap overflow-x-auto sm:w-fit [&>button]:shrink-0 [&>button]:whitespace-nowrap"
                param="status"
                options={[
                  { value: "", label: "Todos", count: counts.all },
                  ...ORDER_STATUSES.map((s) => ({
                    value: s,
                    label: purchaseOrderStatus[s].label,
                    count: counts[s] ?? 0,
                  })),
                ]}
              />
            </div>
            {orders.rows.length ? (
              <>
                <OrdersList rows={orders.rows} today={today} />
                <Pager page={page} pageSize={PAGE_SIZE} total={orders.total} />
              </>
            ) : (
              <EmptyState
                title={status ? `Nenhum pedido ${purchaseOrderStatus[status].label.toLowerCase()}` : "Nenhum pedido de compra ainda"}
                description={
                  status
                    ? "Escolha outra situação para ver os demais pedidos."
                    : "Selecione solicitações acima e clique em Criar pedido, ou monte um pedido do zero."
                }
                action={!status ? <NewOrderDialog suppliers={suppliers} variant="outline" /> : undefined}
              />
            )}
          </Panel>
        </section>

        <Panel
          flush
          title={`Previsão de materiais (próximos ${FORECAST_DAYS} dias)`}
          description="Materiais dos planos de manutenção das OMs preventivas agendadas. Falta = necessidade + mínimo − saldo."
        >
          {forecast.length === 0 ? (
            <EmptyState
              title="Nenhum material previsto"
              description="Não há OMs preventivas com materiais de plano agendadas para os próximos 30 dias."
            />
          ) : (
            <>
              <ul className="divide-y divide-rime md:hidden">
                {forecast.map((f) => (
                  <li key={f.productId} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/estoque/${f.productId}`} className="block truncate text-sm text-silver">
                        {f.name}
                      </Link>
                      <p className="text-xs text-steel tabular-nums">
                        Precisa {formatQty(f.need, f.unit)}, tem {formatQty(f.available, f.unit)}
                      </p>
                    </div>
                    <ForecastAction f={f} requested={requested.has(f.productId)} products={productOptions} />
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Produto</TableHead>
                      <TableHead className="text-right">Necessidade</TableHead>
                      <TableHead className="text-right">Disponível</TableHead>
                      <TableHead className="text-right">Mínimo</TableHead>
                      <TableHead className="text-right">Falta</TableHead>
                      <TableHead className="pr-5 text-right">
                        <span className="sr-only">Ação</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forecast.map((f) => (
                      <TableRow key={f.productId} className={cn(f.shortage > 0 && "bg-gauge-red/[0.04]")}>
                        <TableCell className="pl-5">
                          <Link href={`/admin/estoque/${f.productId}`} className="text-silver hover:text-frost">
                            {f.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-silver">{formatQty(f.need, f.unit)}</TableCell>
                        <TableCell className="text-right tabular-nums text-steel">{formatQty(f.available, f.unit)}</TableCell>
                        <TableCell className="text-right tabular-nums text-steel">{formatQty(f.minStock, f.unit)}</TableCell>
                        <TableCell
                          className={cn("text-right tabular-nums", f.shortage > 0 ? "font-medium text-gauge-red" : "text-mint")}
                        >
                          {f.shortage > 0 ? formatQty(f.shortage, f.unit) : "Coberto"}
                        </TableCell>
                        <TableCell className="pr-5 text-right">
                          <ForecastAction f={f} requested={requested.has(f.productId)} products={productOptions} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}

function ForecastAction({
  f,
  requested,
  products,
}: {
  f: { productId: string; shortage: number; unit: string };
  requested: boolean;
  products: Awaited<ReturnType<typeof listProductOptions>>;
}) {
  if (f.shortage <= 0) return <span className="text-xs text-steel md:hidden">Coberto</span>;
  if (requested) return <ToneBadge tone="ice">Solicitado</ToneBadge>;
  return (
    <NewRequestDialog
      products={products}
      productId={f.productId}
      quantity={f.shortage}
      label={`Solicitar ${formatQty(f.shortage, f.unit)}`}
      size="sm"
    />
  );
}
