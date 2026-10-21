"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { EquipmentStatusBadge } from "@/components/system/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBTU, formatContractCode, formatDate, formatEquipmentCode } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ClickableRow } from "../../clientes/_components/clickable-row";
import { RefrigerantTag } from "./refrigerant";
import { TypeIcon } from "./type-icon";

export type EquipmentRow = {
  id: string;
  code: number;
  brand: string | null;
  model: string | null;
  capacityBtu: number | null;
  refrigerant: string | null;
  location: string | null;
  status: string;
  customerId: string;
  customerLabel: string;
  typeName: string | null;
  typeIcon: string | null;
  siteName: string | null;
  contractId: string | null;
  contractCode: number | null;
  planName: string | null;
  nextVisit: { date: string; kind: "om" | "previsao" | "atrasada" } | null;
};

const NEXT_LABEL = { om: "OM agendada", previsao: "Previsão do plano", atrasada: "OM atrasada" } as const;

export function EquipmentTable({ rows }: { rows: EquipmentRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOnPage = rows.some((r) => selected.has(r.id));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAll = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });

  const href = `/admin/equipamentos/etiquetas?ids=${[...selected].join(",")}`;

  return (
    <>
      <AnimatePresence initial={false}>
        {selected.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-rime bg-ice/[0.06]"
          >
            <div className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className="text-sm text-silver">
                <span className="font-semibold tabular-nums text-ice">{selected.size}</span>{" "}
                {selected.size === 1 ? "equipamento selecionado" : "equipamentos selecionados"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  <X />
                  Limpar
                </Button>
                <Button asChild size="sm">
                  <Link href={href}>
                    <Printer />
                    Imprimir etiquetas
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="border-rime hover:bg-transparent">
              <TableHead className="w-10 pl-5">
                <Checkbox
                  checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(v === true)}
                  aria-label="Selecionar todos desta página"
                />
              </TableHead>
              <TableHead className="text-steel">Código</TableHead>
              <TableHead className="text-steel">Equipamento</TableHead>
              <TableHead className="text-right text-steel">Capacidade</TableHead>
              <TableHead className="text-steel">Fluido</TableHead>
              <TableHead className="text-steel">Cliente e ambiente</TableHead>
              <TableHead className="text-steel">Cobertura</TableHead>
              <TableHead className="text-steel">Próxima visita</TableHead>
              <TableHead className="pr-5 text-steel">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const isSel = selected.has(r.id);
              return (
                <ClickableRow
                  key={r.id}
                  href={`/admin/equipamentos/${r.id}`}
                  className={cn(isSel && "bg-ice/[0.06]", r.status === "removido" && "opacity-55")}
                >
                  <TableCell className="pl-5">
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={(v) => toggle(r.id, v === true)}
                      aria-label={`Selecionar ${formatEquipmentCode(r.code)}`}
                    />
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-steel">{formatEquipmentCode(r.code)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <TypeIcon icon={r.typeIcon} size="sm" />
                      <div className="min-w-0">
                        <Link href={`/admin/equipamentos/${r.id}`} className="block font-medium text-silver hover:text-frost">
                          {r.typeName ?? "Equipamento"}
                        </Link>
                        <span className="block max-w-[180px] truncate text-xs text-steel">
                          {[r.brand, r.model].filter(Boolean).join(" ") || "Marca não informada"}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-silver/90">{formatBTU(r.capacityBtu)}</TableCell>
                  <TableCell>
                    <RefrigerantTag value={r.refrigerant} />
                  </TableCell>
                  <TableCell className="max-w-[240px]">
                    <Link
                      href={`/admin/clientes/${r.customerId}`}
                      className="block truncate text-sm text-silver/90 hover:text-frost"
                    >
                      {r.customerLabel}
                    </Link>
                    <span className="block truncate text-xs text-steel">
                      {[r.location, r.siteName].filter(Boolean).join(", ") || "Ambiente não informado"}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[200px] text-sm">
                    {r.planName ? (
                      <>
                        <span className="block truncate text-silver/90">{r.planName}</span>
                        <span className="block text-xs text-steel">{formatContractCode(r.contractCode)}</span>
                      </>
                    ) : (
                      <span className="text-steel">Avulso</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <NextVisit value={r.nextVisit} />
                  </TableCell>
                  <TableCell className="pr-5">
                    <EquipmentStatusBadge status={r.status} />
                  </TableCell>
                </ClickableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-rime lg:hidden">
        {rows.map((r) => {
          const isSel = selected.has(r.id);
          return (
            <li key={r.id} className={cn("flex gap-3 px-4 py-3.5", isSel && "bg-ice/[0.06]", r.status === "removido" && "opacity-60")}>
              <div className="pt-1">
                <Checkbox
                  checked={isSel}
                  onCheckedChange={(v) => toggle(r.id, v === true)}
                  aria-label={`Selecionar ${formatEquipmentCode(r.code)}`}
                />
              </div>
              <Link href={`/admin/equipamentos/${r.id}`} className="flex min-w-0 flex-1 gap-3">
                <TypeIcon icon={r.typeIcon} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-medium text-silver">
                      {r.typeName ?? "Equipamento"}
                      <span className="ml-1.5 text-xs font-normal tabular-nums text-steel">{formatEquipmentCode(r.code)}</span>
                    </p>
                    <EquipmentStatusBadge status={r.status} />
                  </div>
                  <p className="truncate text-xs text-steel">
                    {[[r.brand, r.model].filter(Boolean).join(" "), r.capacityBtu ? formatBTU(r.capacityBtu) : null]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="mt-1 truncate text-sm text-silver/90">{r.customerLabel}</p>
                  <p className="truncate text-xs text-steel">{[r.location, r.siteName].filter(Boolean).join(", ")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {r.refrigerant && <RefrigerantTag value={r.refrigerant} compact />}
                    {r.nextVisit && (
                      <span className={cn("text-xs", r.nextVisit.kind === "atrasada" ? "text-brass" : "text-steel")}>
                        Próxima visita {formatDate(r.nextVisit.date)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function NextVisit({ value }: { value: EquipmentRow["nextVisit"] }) {
  if (!value) return <span className="text-steel">—</span>;
  return (
    <>
      <span className={cn("block tabular-nums", value.kind === "atrasada" ? "text-brass" : "text-silver/90")}>
        {formatDate(value.date)}
      </span>
      <span className={cn("block text-xs", value.kind === "atrasada" ? "text-brass/80" : "text-steel")}>
        {NEXT_LABEL[value.kind]}
      </span>
    </>
  );
}
