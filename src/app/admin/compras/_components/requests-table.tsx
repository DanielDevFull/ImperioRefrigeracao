"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction } from "@/components/system/confirm-action";
import { Field, nativeSelectClass, useActionToast, ActionForm, FormSubmit } from "@/components/system/form";
import { ToneBadge } from "@/components/system/tone-badge";
import { initialActionState } from "@/lib/action";
import { formatBRL, formatDate, formatOM, formatPO } from "@/lib/format";
import { labelOf, purchaseRequestReason } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { DialogActions, FormDialog } from "../../estoque/_components/form-dialog";
import { formatQty } from "../../estoque/_lib/stock-format";
import { cancelRequest, createOrderFromRequests } from "../actions";
import type { OpenRequest } from "../_lib/queries";

type SupplierOpt = { id: string; name: string; active: boolean };

/** Solicitações abertas com seleção para juntar em um pedido de compra. */
export function RequestsTable({ requests, suppliers }: { requests: OpenRequest[]; suppliers: SupplierOpt[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const open = requests.filter((r) => r.status === "aberta");
  const chosen = requests.filter((r) => selected.has(r.id));
  const estimate = chosen.reduce((s, r) => s + r.quantity * r.costPrice, 0);
  const allChecked = open.length > 0 && open.every((r) => selected.has(r.id));

  const toggle = (id: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // atalhos "Selecionar itens de <fornecedor>"
  const groupMap = new Map<string, { id: string; name: string; ids: string[] }>();
  for (const r of open) {
    if (!r.supplierId) continue;
    const g = groupMap.get(r.supplierId) ?? { id: r.supplierId, name: r.supplierName ?? "", ids: [] };
    g.ids.push(r.id);
    groupMap.set(r.supplierId, g);
  }
  const groups = [...groupMap.values()].sort((a, b) => b.ids.length - a.ids.length);

  return (
    <div>
      <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-rime px-4 py-2.5 sm:px-5">
        <AnimatePresence mode="popLayout" initial={false}>
          {selected.size > 0 ? (
            <motion.div
              key="sel"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.18 }}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-2"
            >
              <span className="text-sm text-silver">
                {selected.size} {selected.size === 1 ? "solicitação selecionada" : "solicitações selecionadas"}
                <span className="ml-2 text-steel tabular-nums">cerca de {formatBRL(estimate)}</span>
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  <X />
                  Limpar
                </Button>
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <ShoppingCart />
                  Criar pedido
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex w-full flex-wrap items-center gap-2"
            >
              <span className="mr-2 text-sm text-steel">Marque as solicitações para juntar em um pedido.</span>
              {groups.length > 1 &&
                groups.slice(0, 3).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelected(new Set(g.ids))}
                    className="rounded-full px-2.5 py-1 text-xs text-frost ring-1 ring-rime transition-colors hover:bg-ice/10"
                  >
                    Itens de {g.name}
                    <span className="ml-1 text-steel tabular-nums">{g.ids.length}</span>
                  </button>
                ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Celular */}
      <ul className="divide-y divide-rime md:hidden">
        {requests.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3">
            <Checkbox
              className="mt-1"
              checked={selected.has(r.id)}
              disabled={r.status !== "aberta"}
              onCheckedChange={(v) => toggle(r.id, v === true)}
              aria-label={`Selecionar ${r.productName}`}
            />
            <div className="min-w-0 flex-1">
              <Link href={`/admin/estoque/${r.productId}`} className="block truncate text-sm text-silver">
                {r.productName}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-steel">
                <span className="tabular-nums text-silver">{formatQty(r.quantity, r.unit)}</span>
                <ReasonBadge reason={r.reason} />
                <Origin r={r} compact />
              </div>
              {r.notes && <p className="mt-1 line-clamp-2 text-xs text-steel">{r.notes}</p>}
            </div>
            {r.status === "aberta" && (
              <ConfirmAction
                action={cancelRequest.bind(null, r.id)}
                title="Cancelar esta solicitação?"
                description={`${formatQty(r.quantity, r.unit)} de ${r.productName} sai da fila de compras.`}
                confirmLabel="Cancelar solicitação"
                destructive
                variant="ghost"
                className="shrink-0 text-steel"
              >
                Cancelar
              </ConfirmAction>
            )}
          </li>
        ))}
      </ul>

      {/* Desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 pl-5">
                <Checkbox
                  checked={allChecked ? true : selected.size > 0 ? "indeterminate" : false}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(open.map((r) => r.id)) : new Set())}
                  aria-label="Selecionar todas as abertas"
                  disabled={!open.length}
                />
              </TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Quantidade</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="hidden xl:table-cell">Fornecedor preferido</TableHead>
              <TableHead className="hidden 2xl:table-cell">Observação</TableHead>
              <TableHead className="hidden lg:table-cell">Criada em</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => {
              const checked = selected.has(r.id);
              return (
                <TableRow key={r.id} data-state={checked ? "selected" : undefined} className={cn(checked && "bg-ice/5")}>
                  <TableCell className="pl-5">
                    <Checkbox
                      checked={checked}
                      disabled={r.status !== "aberta"}
                      onCheckedChange={(v) => toggle(r.id, v === true)}
                      aria-label={`Selecionar ${r.productName}`}
                    />
                  </TableCell>
                  <TableCell className="max-w-72" title={r.notes ?? undefined}>
                    <Link href={`/admin/estoque/${r.productId}`} className="block truncate text-silver hover:text-frost">
                      {r.productName}
                    </Link>
                    <span className="block max-w-72 truncate text-xs text-steel 2xl:hidden">{r.notes ?? r.sku ?? "Sem SKU"}</span>
                    <span className="hidden text-xs text-steel 2xl:inline">{r.sku ?? "Sem SKU"}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-silver">{formatQty(r.quantity, r.unit)}</TableCell>
                  <TableCell>
                    <ReasonBadge reason={r.reason} />
                  </TableCell>
                  <TableCell>
                    <Origin r={r} />
                  </TableCell>
                  <TableCell className="hidden max-w-44 truncate text-steel xl:table-cell">{r.supplierName ?? "—"}</TableCell>
                  <TableCell className="hidden max-w-64 truncate text-xs text-steel 2xl:table-cell" title={r.notes ?? undefined}>
                    {r.notes ?? "—"}
                  </TableCell>
                  <TableCell className="hidden tabular-nums text-steel lg:table-cell">{formatDate(r.createdAt)}</TableCell>
                  <TableCell className="pr-5 text-right">
                    {r.status === "aberta" && (
                      <ConfirmAction
                        action={cancelRequest.bind(null, r.id)}
                        title="Cancelar esta solicitação?"
                        description={`${formatQty(r.quantity, r.unit)} de ${r.productName} sai da fila de compras. Se o saldo continuar abaixo do mínimo, a rotina diária abre outra.`}
                        confirmLabel="Cancelar solicitação"
                        destructive
                        variant="ghost"
                      >
                        Cancelar
                      </ConfirmAction>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Criar pedido de compra"
        description="As solicitações viram itens de um rascunho de pedido, com o custo atual de cada produto. Você revisa antes de enviar."
        className="sm:max-w-xl"
      >
        {() => <FromRequestsForm chosen={chosen} suppliers={suppliers} />}
      </FormDialog>
    </div>
  );
}

function ReasonBadge({ reason }: { reason: string }) {
  const l = labelOf(purchaseRequestReason, reason);
  return <ToneBadge tone={l.tone}>{l.label}</ToneBadge>;
}

function Origin({ r, compact = false }: { r: OpenRequest; compact?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      {r.purchaseOrderId && r.purchaseOrderNumber != null && (
        <Link href={`/admin/compras/pedidos/${r.purchaseOrderId}`}>
          <ToneBadge tone="ice">Em {formatPO(r.purchaseOrderNumber)}</ToneBadge>
        </Link>
      )}
      {r.workOrderId && r.workOrderNumber != null ? (
        <Link href={`/admin/oms/${r.workOrderId}`} className="text-frost hover:underline">
          {formatOM(r.workOrderNumber)}
        </Link>
      ) : (
        !r.purchaseOrderId && !compact && <span className="text-steel/60 light:text-steel/90">—</span>
      )}
    </span>
  );
}

function FromRequestsForm({ chosen, suppliers }: { chosen: OpenRequest[]; suppliers: SupplierOpt[] }) {
  const [state, action, pending] = useActionState(createOrderFromRequests, initialActionState);
  useActionToast(state);
  const e = state.fieldErrors ?? {};
  // fornecedor padrão: o preferido mais comum entre os itens
  const counts = new Map<string, number>();
  for (const r of chosen) if (r.supplierId) counts.set(r.supplierId, (counts.get(r.supplierId) ?? 0) + 1);
  const preferred = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const [supplierId, setSupplierId] = useState(preferred);
  const others = chosen.filter((r) => r.supplierId && r.supplierId !== supplierId);
  const estimate = chosen.reduce((s, r) => s + r.quantity * r.costPrice, 0);
  const active = suppliers.filter((s) => s.active);

  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      {chosen.map((r) => (
        <input key={r.id} type="hidden" name="requestId" value={r.id} />
      ))}
      <ul className="max-h-48 divide-y divide-rime overflow-y-auto rounded-lg border border-rime bg-muted/40">
        {chosen.map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-silver">{r.productName}</span>
            <span className="shrink-0 tabular-nums text-steel">
              {formatQty(r.quantity, r.unit)}
              <span className="ml-2 text-silver">{formatBRL(r.quantity * r.costPrice)}</span>
            </span>
          </li>
        ))}
        <li className="flex items-baseline justify-between px-3 py-2 text-sm">
          <span className="text-steel">Estimativa pelo custo atual</span>
          <span className="tabular-nums font-medium text-silver">{formatBRL(estimate)}</span>
        </li>
      </ul>
      <Field
        label="Fornecedor"
        required
        error={e.supplierId}
        htmlFor="fr-supplier"
        hint={
          others.length
            ? `${others.length === 1 ? "1 item tem" : `${others.length} itens têm`} outro fornecedor preferido. Se preferir, crie pedidos separados.`
            : undefined
        }
      >
        <select
          id="fr-supplier"
          name="supplierId"
          value={supplierId}
          onChange={(ev) => setSupplierId(ev.target.value)}
          className={nativeSelectClass}
        >
          <option value="" disabled>
            Escolha o fornecedor
          </option>
          {active.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Previsão de entrega" error={e.expectedDate} htmlFor="fr-expected">
        <Input id="fr-expected" name="expectedDate" type="date" className="h-9" />
      </Field>
      <Field label="Observações" htmlFor="fr-notes">
        <Textarea id="fr-notes" name="notes" rows={2} placeholder="Condição de pagamento, forma de entrega…" />
      </Field>
      {state.error && e.requestIds && <p className="text-sm text-gauge-red">{e.requestIds}</p>}
      <DialogActions>
        <FormSubmit>Criar pedido</FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}
