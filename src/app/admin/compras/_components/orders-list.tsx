import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PurchaseOrderStatusBadge } from "@/components/system/status";
import { formatBRL, formatDate, formatPO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrderRow } from "../_lib/queries";

function expectedTone(o: OrderRow, today: string) {
  return o.expectedDate && o.expectedDate < today && (o.status === "enviado" || o.status === "recebido_parcial");
}

/** Lista de pedidos de compra (tabela no desktop, linhas empilhadas no celular). */
export function OrdersList({ rows, today, hideSupplier = false }: { rows: OrderRow[]; today: string; hideSupplier?: boolean }) {
  return (
    <>
      <ul className="divide-y divide-rime md:hidden">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={`/admin/compras/pedidos/${o.id}`} className="flex items-start gap-3 px-4 py-3 active:bg-ice/5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-silver tabular-nums">{formatPO(o.number)}</p>
                <p className="truncate text-xs text-steel">
                  {hideSupplier ? `${o.items} ${o.items === 1 ? "item" : "itens"}` : (o.supplierName ?? "Sem fornecedor")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm tabular-nums text-silver">{formatBRL(o.total + o.freight)}</p>
                <div className="mt-1">
                  <PurchaseOrderStatusBadge status={o.status} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Pedido</TableHead>
              {!hideSupplier && <TableHead>Fornecedor</TableHead>}
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="hidden lg:table-cell">Enviado em</TableHead>
              <TableHead className="pr-5">Previsão</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => (
              <TableRow key={o.id} className="relative">
                <TableCell className="pl-5">
                  <Link
                    href={`/admin/compras/pedidos/${o.id}`}
                    className="font-medium tabular-nums text-silver after:absolute after:inset-0 hover:text-frost"
                  >
                    {formatPO(o.number)}
                  </Link>
                </TableCell>
                {!hideSupplier && <TableCell className="max-w-56 truncate text-steel">{o.supplierName ?? "Sem fornecedor"}</TableCell>}
                <TableCell>
                  <PurchaseOrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums text-steel">{o.items}</TableCell>
                <TableCell className="text-right tabular-nums text-silver">{formatBRL(o.total + o.freight)}</TableCell>
                <TableCell className="hidden tabular-nums text-steel lg:table-cell">{formatDate(o.orderDate)}</TableCell>
                <TableCell className={cn("pr-5 tabular-nums", expectedTone(o, today) ? "text-gauge-red" : "text-steel")}>
                  {o.status === "recebido" ? (
                    <span className="text-mint">Recebido {formatDate(o.receivedAt)}</span>
                  ) : (
                    <>
                      {formatDate(o.expectedDate)}
                      {expectedTone(o, today) && <span className="ml-1.5 text-xs">atrasado</span>}
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
