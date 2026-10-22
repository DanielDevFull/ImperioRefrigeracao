import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart } from "@/components/charts/bar-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { Pager } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { DetailList, Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { PurchaseRequestStatusBadge } from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { todayISO } from "@/lib/dates";
import { formatBRL, formatDate, formatDateTime, formatOM, formatPO, formatPercent } from "@/lib/format";
import { labelOf, productCategory, productUnit, purchaseRequestReason, stockMovementType } from "@/lib/labels";
import { pageFrom } from "@/lib/params";
import { cn } from "@/lib/utils";
import { NewRequestDialog } from "../../compras/_components/request-dialog";
import { setProductActive } from "../actions";
import { EditProductDialog } from "../_components/edit-product-dialog";
import { StockActions } from "../_components/movement-dialogs";
import { ToastOnArrival } from "../_components/param-controls";
import { StockGauge } from "../_components/stock-gauge";
import {
  getMovementData,
  getProduct,
  getProductLevels,
  getProductRequests,
  listProductMovements,
  listSupplierOptions,
  productConsumption,
} from "../_lib/queries";
import { formatQty, formatSignedQty } from "../_lib/stock-format";
import { requireStaff } from "@/lib/auth/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/admin/estoque/[productId]">): Promise<Metadata> {
  const { productId } = await params;
  const p = UUID.test(productId) ? await getProduct(productId) : null;
  return { title: p?.name ?? "Produto" };
}

export default async function ProdutoPage({ params, searchParams }: PageProps<"/admin/estoque/[productId]">) {
  await requireStaff();
  const { productId } = await params;
  if (!UUID.test(productId)) notFound();
  const sp = await searchParams;
  const page = pageFrom(sp);
  const today = todayISO();
  const product = await getProduct(productId);
  if (!product) notFound();

  const [levels, movements, consumption, requests, movementData, suppliers] = await Promise.all([
    getProductLevels(productId),
    listProductMovements(productId, page),
    productConsumption(productId, today),
    getProductRequests(productId),
    getMovementData(productId),
    listSupplierOptions(),
  ]);
  const total = levels.reduce((s, l) => s + l.quantity, 0);
  const below = product.minStock > 0 && total < product.minStock;
  const used90 = consumption.reduce((s, c) => s + c.consumo, 0);
  const margin = product.costPrice > 0 && product.salePrice > 0 ? (product.salePrice - product.costPrice) / product.costPrice : null;
  const unit = product.unit;
  const reorderSuggestion = Math.max(product.reorderQty, product.minStock - total, 0) || product.reorderQty || 1;

  return (
    <>
      <ToastOnArrival param="criado" message="Produto cadastrado" />
      <PageHeader
        back={{ href: "/admin/estoque", label: "Estoque" }}
        title={product.name}
        description={product.sku ? `SKU ${product.sku}` : "Sem SKU"}
        meta={
          <>
            <ToneBadge tone="frost">{productCategory[product.category] ?? product.category}</ToneBadge>
            {!product.active && <ToneBadge tone="steel">Inativo</ToneBadge>}
            {below && <ToneBadge tone={total <= 0 ? "red" : "brass"}>{total <= 0 ? "Sem saldo" : "Abaixo do mínimo"}</ToneBadge>}
          </>
        }
        actions={
          <>
            {product.active && <StockActions data={movementData} productId={product.id} />}
            <EditProductDialog
              suppliers={suppliers}
              product={{
                id: product.id,
                sku: product.sku,
                name: product.name,
                category: product.category,
                unit: product.unit,
                costPrice: product.costPrice,
                salePrice: product.salePrice,
                minStock: product.minStock,
                reorderQty: product.reorderQty,
                preferredSupplierId: product.preferredSupplierId,
                barcode: product.barcode,
                notes: product.notes,
                active: product.active,
              }}
            />
          </>
        }
      />

      <ReadoutBand
        className="mb-6"
        items={[
          {
            label: "Saldo total",
            value: total,
            format: "number",
            tone: below ? (total <= 0 ? "red" : "brass") : undefined,
            hint: `${productUnit[unit] ?? unit} em ${levels.filter((l) => l.quantity !== 0).length} ${levels.filter((l) => l.quantity !== 0).length === 1 ? "local" : "locais"}`,
          },
          {
            label: "Estoque mínimo",
            value: product.minStock,
            format: "number",
            hint: product.minStock > 0 ? `repõe ${formatQty(product.reorderQty, unit)}` : "sem reposição automática",
          },
          { label: "Custo médio", value: product.costPrice, format: "brl", hint: margin != null ? `venda ${formatBRL(product.salePrice)}` : "por unidade" },
          { label: "Valor em estoque", value: Math.max(0, total) * product.costPrice, format: "brl", hint: "saldo × custo" },
          { label: "Consumo em 90 dias", value: used90, format: "number", hint: `${unit} usados em OMs` },
        ]}
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <Panel flush title="Saldo por local" className="lg:col-span-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Local</TableHead>
                <TableHead className="hidden sm:table-cell">Responsável</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="hidden pr-5 text-right sm:table-cell">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels.map((l) => (
                <TableRow key={l.locationId} className={cn(!l.active && "opacity-60")}>
                  <TableCell className="pl-5">
                    <span className="text-silver">{l.name}</span>
                    <span className="ml-2 text-xs text-steel">{l.type === "almoxarifado" ? "Almoxarifado" : "Veículo"}</span>
                  </TableCell>
                  <TableCell className="hidden text-steel sm:table-cell">
                    {l.technicianId ? (
                      <Link href={`/admin/tecnicos/${l.technicianId}`} className="hover:text-frost">
                        {l.technicianName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      l.quantity < 0 ? "text-gauge-red" : l.quantity === 0 ? "text-steel/70 light:text-steel/90" : "text-silver",
                    )}
                  >
                    {formatQty(l.quantity, unit)}
                  </TableCell>
                  <TableCell className="hidden pr-5 text-right tabular-nums text-steel sm:table-cell">
                    {formatBRL(Math.max(0, l.quantity) * product.costPrice)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="hover:bg-transparent">
                <TableCell className="pl-5 font-medium text-silver">Total</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="inline-flex items-center gap-2 text-xs text-steel">
                    <StockGauge total={total} minStock={product.minStock} />
                    {product.minStock > 0 && `mínimo ${formatQty(product.minStock, unit)}`}
                  </span>
                </TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", below ? "text-gauge-red" : "text-silver")}>
                  {formatQty(total, unit)}
                </TableCell>
                <TableCell className="hidden pr-5 text-right font-medium tabular-nums text-silver sm:table-cell">
                  {formatBRL(Math.max(0, total) * product.costPrice)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Panel>

        <Panel
          title="Consumo em OMs"
          description={used90 > 0 ? `${formatQty(used90, unit)} nos últimos 90 dias` : "Últimos 90 dias, por mês"}
          className="lg:col-span-2"
        >
          {used90 > 0 ? (
            <BarChart data={consumption} xKey="label" series={[{ key: "consumo", label: `Consumo (${unit})` }]} height={200} />
          ) : (
            <div className="grid h-[200px] place-items-center text-center">
              <p className="max-w-60 text-sm text-steel">
                Nenhum consumo em OMs nos últimos 90 dias. O gráfico aparece quando os técnicos lançarem este material.
              </p>
            </div>
          )}
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <Panel title="Cadastro" className="lg:col-span-3">
          <DetailList
            columns={3}
            items={[
              { label: "SKU", value: product.sku ?? "—" },
              { label: "Código de barras", value: product.barcode ?? "—" },
              { label: "Unidade", value: productUnit[unit] ?? unit },
              { label: "Custo", value: formatBRL(product.costPrice) },
              {
                label: "Preço de venda",
                value: product.salePrice > 0 ? (
                  <>
                    {formatBRL(product.salePrice)}
                    {margin != null && <span className="ml-1.5 text-xs text-steel">margem {formatPercent(margin)}</span>}
                  </>
                ) : (
                  "Não cobrado"
                ),
              },
              {
                label: "Fornecedor preferido",
                value: product.preferredSupplier ? (
                  <Link href={`/admin/fornecedores/${product.preferredSupplier.id}`} className="hover:text-frost">
                    {product.preferredSupplier.name}
                  </Link>
                ) : (
                  "—"
                ),
              },
              { label: "Estoque mínimo", value: product.minStock > 0 ? formatQty(product.minStock, unit) : "—" },
              { label: "Reposição sugerida", value: product.reorderQty > 0 ? formatQty(product.reorderQty, unit) : "—" },
              { label: "Atualizado em", value: formatDateTime(product.updatedAt) },
            ]}
          />
          {product.notes && <p className="mt-5 whitespace-pre-line border-t border-rime pt-4 text-sm text-steel">{product.notes}</p>}
          <div className="mt-5 flex justify-end border-t border-rime pt-4">
            <ConfirmAction
              action={setProductActive.bind(null, product.id, !product.active)}
              title={product.active ? "Desativar este produto?" : "Reativar este produto?"}
              description={
                product.active
                  ? "Ele some das listas de seleção (OMs, compras, movimentações) e deixa de gerar reposição. O histórico continua guardado."
                  : "O produto volta às listas de seleção e à reposição automática."
              }
              confirmLabel={product.active ? "Desativar produto" : "Reativar produto"}
              destructive={product.active}
              variant="ghost"
            >
              {product.active ? "Desativar produto" : "Reativar produto"}
            </ConfirmAction>
          </div>
        </Panel>

        <Panel
          title="Reposição"
          description={requests.length ? "Solicitações em andamento" : undefined}
          className="lg:col-span-2"
          actions={
            product.active && requests.length > 0 ? (
              <NewRequestDialog
                products={movementData.products}
                productId={product.id}
                quantity={reorderSuggestion}
                label="Solicitar mais"
                variant="ghost"
                size="sm"
              />
            ) : undefined
          }
        >
          {requests.length ? (
            <ul className="space-y-3">
              {requests.map((r) => {
                const reason = labelOf(purchaseRequestReason, r.reason);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                    <span className="tabular-nums text-silver">{formatQty(r.quantity, unit)}</span>
                    <ToneBadge tone={reason.tone}>{reason.label}</ToneBadge>
                    <PurchaseRequestStatusBadge status={r.status} />
                    {r.purchaseOrder ? (
                      <Link href={`/admin/compras/pedidos/${r.purchaseOrder.id}`} className="ml-auto text-xs text-frost hover:underline">
                        {formatPO(r.purchaseOrder.number)}
                      </Link>
                    ) : (
                      <span className="ml-auto text-xs text-steel">{formatDate(r.createdAt)}</span>
                    )}
                  </li>
                );
              })}
              <li className="pt-1">
                <Link href="/admin/compras" className="text-xs text-steel hover:text-frost">
                  Ver todas em Compras
                </Link>
              </li>
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-steel">
                {below
                  ? "Saldo abaixo do mínimo e nenhuma solicitação aberta. A rotina diária abre uma, ou peça agora."
                  : "Nenhuma solicitação de compra aberta para este produto."}
              </p>
              {product.active && (
                <NewRequestDialog
                  products={movementData.products}
                  productId={product.id}
                  quantity={reorderSuggestion}
                  label="Solicitar compra"
                  variant={below ? "default" : "outline"}
                />
              )}
            </div>
          )}
        </Panel>
      </div>

      <Panel flush title="Movimentações" description="Entradas, saídas, transferências e consumo em OMs, da mais recente para a mais antiga.">
        {movements.rows.length === 0 ? (
          <EmptyState
            title="Nenhuma movimentação ainda"
            description="Registre a primeira entrada para começar a controlar o saldo deste produto."
            action={product.active ? <StockActions data={movementData} productId={product.id} only={["entrada"]} /> : undefined}
          />
        ) : (
          <>
            <ul className="divide-y divide-rime md:hidden">
              {movements.rows.map((m) => {
                const t = labelOf(stockMovementType, m.type);
                return (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <ToneBadge tone={t.tone}>{t.label}</ToneBadge>
                      <span className={cn("text-sm font-medium tabular-nums", m.quantity > 0 ? "text-mint" : "text-gauge-red")}>
                        {formatSignedQty(m.quantity, unit)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-steel">
                      <span className="min-w-0 truncate">{m.locationName}</span>
                      <span className="shrink-0 tabular-nums">{formatDateTime(m.createdAt)}</span>
                    </div>
                    {(m.workOrderId || m.purchaseOrderId) && (
                      <div className="mt-1">
                        <MovementLinks m={m} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead className="text-right">Custo unit.</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="hidden xl:table-cell">Observação</TableHead>
                    <TableHead className="hidden pr-5 lg:table-cell">Usuário</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.rows.map((m) => {
                    const t = labelOf(stockMovementType, m.type);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="pl-5 tabular-nums text-steel">{formatDateTime(m.createdAt)}</TableCell>
                        <TableCell>
                          <ToneBadge tone={t.tone}>{t.label}</ToneBadge>
                        </TableCell>
                        <TableCell
                          className={cn("text-right font-medium tabular-nums", m.quantity > 0 ? "text-mint" : "text-gauge-red")}
                        >
                          {formatSignedQty(m.quantity, unit)}
                        </TableCell>
                        <TableCell className="max-w-56 truncate text-silver">{m.locationName}</TableCell>
                        <TableCell className="text-right tabular-nums text-steel">{m.unitCost ? formatBRL(m.unitCost) : "—"}</TableCell>
                        <TableCell>
                          <MovementLinks m={m} />
                        </TableCell>
                        <TableCell className="hidden max-w-64 truncate text-xs text-steel xl:table-cell" title={m.notes ?? undefined}>
                          {m.notes ?? "—"}
                        </TableCell>
                        <TableCell className="hidden pr-5 text-steel lg:table-cell">{m.userName ?? "Sistema"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Pager page={page} pageSize={movements.pageSize} total={movements.total} />
          </>
        )}
      </Panel>
    </>
  );
}

function MovementLinks({
  m,
}: {
  m: { workOrderId: string | null; workOrderNumber: number | null; purchaseOrderId: string | null; purchaseOrderNumber: number | null };
}) {
  if (!m.workOrderId && !m.purchaseOrderId) return <span className="text-steel/60 light:text-steel/90">—</span>;
  return (
    <span className="flex flex-wrap gap-2 text-xs">
      {m.workOrderId && (
        <Link href={`/admin/oms/${m.workOrderId}`} className="tabular-nums text-frost hover:underline">
          {m.workOrderNumber != null ? formatOM(m.workOrderNumber) : "Ver OM"}
        </Link>
      )}
      {m.purchaseOrderId && (
        <Link href={`/admin/compras/pedidos/${m.purchaseOrderId}`} className="tabular-nums text-frost hover:underline">
          {m.purchaseOrderNumber != null ? formatPO(m.purchaseOrderNumber) : "Ver pedido"}
        </Link>
      )}
    </span>
  );
}
