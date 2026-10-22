import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { Pager } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { DetailList, Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { PayableStatusBadge } from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { todayISO } from "@/lib/dates";
import { formatBRL, formatDate, formatDocument, formatPhone, whatsappLink } from "@/lib/format";
import { effectiveFinanceStatus } from "@/lib/labels";
import { pageFrom } from "@/lib/params";
import { cn } from "@/lib/utils";
import { NewOrderDialog } from "../../compras/_components/order-dialog";
import { OrdersList } from "../../compras/_components/orders-list";
import { listPurchaseOrders } from "../../compras/_lib/queries";
import { listSupplierOptions } from "../../estoque/_lib/queries";
import { setSupplierActive } from "../actions";
import { SupplierDialog } from "../_components/supplier-dialog";
import { getSupplier, supplierPayables, supplierProducts, supplierStats } from "../_lib/queries";
import { requireStaff } from "@/lib/auth/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDERS_PAGE = 10;

export async function generateMetadata({ params }: PageProps<"/admin/fornecedores/[id]">): Promise<Metadata> {
  const { id } = await params;
  const s = UUID.test(id) ? await getSupplier(id) : null;
  return { title: s?.name ?? "Fornecedor" };
}

export default async function FornecedorPage({ params, searchParams }: PageProps<"/admin/fornecedores/[id]">) {
  await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const page = pageFrom(sp);
  const supplier = await getSupplier(id);
  if (!supplier) notFound();
  const today = todayISO();
  const [stats, orders, items, bills, supplierOptions] = await Promise.all([
    supplierStats(id),
    listPurchaseOrders({ supplierId: id, page, pageSize: ORDERS_PAGE }),
    supplierProducts(id),
    supplierPayables(id),
    listSupplierOptions(),
  ]);
  const wa = whatsappLink(supplier.phone, supplier.contactName ? `Olá, ${supplier.contactName}!` : undefined);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/fornecedores", label: "Fornecedores" }}
        title={supplier.name}
        description={supplier.document ? `CNPJ ${formatDocument(supplier.document)}` : "Sem CNPJ cadastrado"}
        meta={!supplier.active ? <ToneBadge tone="steel">Inativo</ToneBadge> : undefined}
        actions={
          <>
            {wa && (
              <Button variant="outline" asChild>
                <a href={wa} target="_blank" rel="noreferrer">
                  <MessageCircle />
                  WhatsApp
                </a>
              </Button>
            )}
            <SupplierDialog
              supplier={{
                id: supplier.id,
                name: supplier.name,
                document: supplier.document,
                contactName: supplier.contactName,
                phone: supplier.phone,
                email: supplier.email,
                notes: supplier.notes,
                active: supplier.active,
              }}
            />
            {supplier.active && <NewOrderDialog suppliers={supplierOptions} supplierId={supplier.id} />}
          </>
        }
      />

      <ReadoutBand
        className="mb-6"
        items={[
          { label: "Comprado em 12 meses", value: stats.bought12m, format: "brl", hint: stats.lastOrder ? `último pedido ${formatDate(stats.lastOrder)}` : "nenhum pedido ainda" },
          { label: "Pedidos em andamento", value: stats.inProgress, hint: "enviados ou em recebimento" },
          {
            label: "Em aberto a pagar",
            value: stats.openPayables,
            format: "brl",
            tone: stats.openPayables > 0 ? "brass" : undefined,
            hint: stats.openPayablesCount ? `${stats.openPayablesCount} ${stats.openPayablesCount === 1 ? "conta" : "contas"}` : "nada pendente",
          },
          { label: "Produtos com preferência", value: items.length, hint: "fornecedor preferido" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Panel flush title="Pedidos de compra" description="Do mais recente para o mais antigo.">
            {orders.rows.length ? (
              <>
                <OrdersList rows={orders.rows} today={today} hideSupplier />
                <Pager page={page} pageSize={ORDERS_PAGE} total={orders.total} />
              </>
            ) : (
              <EmptyState
                title="Nenhum pedido para este fornecedor"
                description="Crie um pedido aqui ou junte solicitações de compra em Compras."
                action={supplier.active ? <NewOrderDialog suppliers={supplierOptions} supplierId={supplier.id} variant="outline" /> : undefined}
              />
            )}
          </Panel>

          <Panel flush title="Contas a pagar" description="Em aberto primeiro, depois as últimas pagas.">
            {bills.length ? (
              <ul className="divide-y divide-rime">
                {bills.map((b) => {
                  const st = effectiveFinanceStatus(b.status, b.dueDate, today);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        {b.purchaseOrderId ? (
                          <Link href={`/admin/compras/pedidos/${b.purchaseOrderId}`} className="block truncate text-silver hover:text-frost">
                            {b.description}
                          </Link>
                        ) : (
                          <p className="truncate text-silver">{b.description}</p>
                        )}
                        <p className="text-xs text-steel">
                          {st === "pago" ? `Pago em ${formatDate(b.paidAt)}` : `Vence em ${formatDate(b.dueDate)}`}
                          {b.documentNumber && <span className="ml-2">{b.documentNumber}</span>}
                        </p>
                      </div>
                      <span className={cn("tabular-nums", st === "vencido" ? "text-gauge-red" : "text-silver")}>{formatBRL(b.amount)}</span>
                      <PayableStatusBadge status={st} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-steel">Nenhuma conta a pagar ligada a este fornecedor.</p>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Cadastro">
            <DetailList
              columns={1}
              items={[
                { label: "Contato", value: supplier.contactName ?? "—" },
                {
                  label: "Telefone",
                  value: supplier.phone ? (
                    <a href={`tel:${supplier.phone}`} className="tabular-nums hover:text-frost">
                      {formatPhone(supplier.phone)}
                    </a>
                  ) : (
                    "—"
                  ),
                },
                {
                  label: "E-mail",
                  value: supplier.email ? (
                    <a href={`mailto:${supplier.email}`} className="inline-flex items-center gap-1.5 hover:text-frost">
                      <Mail className="size-3.5" />
                      {supplier.email}
                    </a>
                  ) : (
                    "—"
                  ),
                },
                { label: "Cadastrado em", value: formatDate(supplier.createdAt) },
              ]}
            />
            {supplier.notes && <p className="mt-4 whitespace-pre-line border-t border-rime pt-4 text-sm text-steel">{supplier.notes}</p>}
            <div className="mt-4 flex justify-end border-t border-rime pt-4">
              <ConfirmAction
                action={setSupplierActive.bind(null, supplier.id, !supplier.active)}
                title={supplier.active ? `Desativar ${supplier.name}?` : `Reativar ${supplier.name}?`}
                description={
                  supplier.active
                    ? "Ele deixa de aparecer para novos pedidos. Pedidos e contas existentes continuam como estão."
                    : "Ele volta a aparecer na criação de pedidos."
                }
                confirmLabel={supplier.active ? "Desativar fornecedor" : "Reativar fornecedor"}
                destructive={supplier.active}
                variant="ghost"
              >
                {supplier.active ? "Desativar fornecedor" : "Reativar fornecedor"}
              </ConfirmAction>
            </div>
          </Panel>

          <Panel flush title="Produtos" description="Itens que têm este fornecedor como preferido.">
            {items.length ? (
              <ul className="divide-y divide-rime">
                {items.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/estoque/${p.id}`} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm hover:bg-ice/5">
                      <span className="min-w-0 truncate text-silver">{p.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-steel">{formatBRL(p.costPrice)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-steel">
                Nenhum produto com este fornecedor como preferido. Defina no cadastro do produto, em Estoque.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
