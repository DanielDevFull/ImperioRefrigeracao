"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, UserRoundPlus, X } from "lucide-react";
import { toast } from "sonner";
import { PriorityBadge, WorkOrderStatusBadge, WorkOrderTypeBadge } from "@/components/system/status";
import { nativeSelectClass } from "@/components/system/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatOM, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bulkAssignAction } from "../actions";
import { NOT_ASSIGNABLE } from "../_lib/constants";
import { TechLabel } from "./tech-label";
import { DateField, SelectField, TimeField } from "@/components/system/fields";

export type OmRow = {
  id: string;
  number: number;
  type: string;
  status: string;
  priority: string;
  title: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  customerName: string;
  customerTradeName: string | null;
  equipmentType: string | null;
  equipmentLocation: string | null;
  equipmentBrand: string | null;
  technicianName: string | null;
  technicianColor: string | null;
  late: boolean;
};

function ScheduleCell({ row }: { row: OmRow }) {
  if (!row.scheduledDate) return <span className="text-steel">Sem data</span>;
  return (
    <span className={cn("readout whitespace-nowrap", row.late ? "text-gauge-red" : "text-silver")}>
      {formatDate(row.scheduledDate)}
      {row.scheduledTime && <span className={cn("ml-1.5", row.late ? "text-gauge-red/80 light:text-gauge-red" : "text-steel")}>{formatTime(row.scheduledTime)}</span>}
      {row.late && <span className="mt-0.5 block text-[0.7rem] font-medium">Atrasada</span>}
    </span>
  );
}

function Equip({ row }: { row: OmRow }) {
  if (!row.equipmentType && !row.equipmentLocation) return <span className="text-steel">—</span>;
  return (
    <span className="block min-w-0">
      <span className="block truncate text-silver">{row.equipmentType ?? row.equipmentBrand ?? "Equipamento"}</span>
      {row.equipmentLocation && <span className="block truncate text-xs text-steel">{row.equipmentLocation}</span>}
    </span>
  );
}

const urgent = (p: string) => p === "alta" || p === "urgente";

export function OmsTable({
  rows,
  technicians,
  today,
}: {
  rows: OmRow[];
  technicians: { id: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [techId, setTechId] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [pending, start] = useTransition();

  const selectable = rows.filter((r) => !NOT_ASSIGNABLE.has(r.status));
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleAll = (on: boolean) => setSelected(on ? new Set(selectable.map((r) => r.id)) : new Set());

  const submit = () => {
    if (!techId) return toast.error("Escolha o técnico que vai atender as OMs selecionadas.");
    if (!date) return toast.error("Escolha a data do atendimento.");
    start(async () => {
      const r = await bulkAssignAction({ ids: [...selected], technicianId: techId, scheduledDate: date, scheduledTime: time || null });
      if (r.ok) {
        toast.success(r.message ?? "Técnico atribuído");
        setSelected(new Set());
      } else toast.error(r.error ?? "Não foi possível atribuir.");
    });
  };

  return (
    <>
      {/* Desktop: tabela */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-rime hover:bg-transparent">
              <TableHead className="w-10 pl-5">
                <Checkbox
                  aria-label="Selecionar todas as OMs da página"
                  checked={allSelected}
                  disabled={!selectable.length}
                  onCheckedChange={(v) => toggleAll(v === true)}
                />
              </TableHead>
              <TableHead className="text-steel">Número</TableHead>
              <TableHead className="text-steel">Tipo</TableHead>
              <TableHead className="text-steel">Título</TableHead>
              <TableHead className="text-steel">Cliente</TableHead>
              <TableHead className="text-steel">Equipamento</TableHead>
              <TableHead className="text-steel">Técnico</TableHead>
              <TableHead className="text-steel">Agendada</TableHead>
              <TableHead className="pr-5 text-steel">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const canSelect = !NOT_ASSIGNABLE.has(r.status);
              const isSel = selected.has(r.id);
              return (
                <TableRow
                  key={r.id}
                  data-state={isSel ? "selected" : undefined}
                  onClick={() => router.push(`/admin/oms/${r.id}`)}
                  className="cursor-pointer border-rime/70 transition-colors hover:bg-ice/[0.04] data-[state=selected]:bg-ice/[0.07]"
                >
                  <TableCell className="pl-5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={`Selecionar ${formatOM(r.number)}`}
                      checked={isSel}
                      disabled={!canSelect}
                      onCheckedChange={(v) => toggle(r.id, v === true)}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/oms/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="readout font-medium text-frost hover:text-ice"
                    >
                      {formatOM(r.number)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <WorkOrderTypeBadge type={r.type} />
                  </TableCell>
                  <TableCell className="max-w-[17rem] whitespace-normal">
                    <span className="line-clamp-2 text-silver">{r.title}</span>
                    {urgent(r.priority) && (
                      <span className="mt-1 inline-block">
                        <PriorityBadge value={r.priority} />
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[12rem]">
                    <span className="block truncate text-silver">{r.customerTradeName ?? r.customerName}</span>
                  </TableCell>
                  <TableCell className="max-w-[10rem]">
                    <Equip row={r} />
                  </TableCell>
                  <TableCell className="max-w-[10rem]">
                    <TechLabel name={r.technicianName} color={r.technicianColor} />
                  </TableCell>
                  <TableCell>
                    <ScheduleCell row={r} />
                  </TableCell>
                  <TableCell className="pr-5">
                    <WorkOrderStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Celular: linhas empilhadas */}
      <ul className="divide-y divide-rime md:hidden">
        {rows.map((r) => {
          const canSelect = !NOT_ASSIGNABLE.has(r.status);
          const isSel = selected.has(r.id);
          return (
            <li key={r.id} className={cn("flex gap-3 px-4 py-3.5", isSel && "bg-ice/[0.07]")}>
              <div className="pt-0.5">
                <Checkbox
                  aria-label={`Selecionar ${formatOM(r.number)}`}
                  checked={isSel}
                  disabled={!canSelect}
                  onCheckedChange={(v) => toggle(r.id, v === true)}
                />
              </div>
              <Link href={`/admin/oms/${r.id}`} className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="readout text-sm font-medium text-frost">{formatOM(r.number)}</span>
                  <WorkOrderStatusBadge status={r.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-silver">{r.title}</p>
                <p className="mt-0.5 truncate text-xs text-steel">
                  {r.customerTradeName ?? r.customerName}
                  {r.equipmentType ? `, ${r.equipmentType}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  <WorkOrderTypeBadge type={r.type} />
                  {urgent(r.priority) && <PriorityBadge value={r.priority} />}
                  <TechLabel name={r.technicianName} color={r.technicianColor} />
                  <ScheduleCell row={r} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-4xl lg:left-[17rem]"
            role="region"
            aria-label="Ações em lote"
          >
            <div className="glass frost-edge flex flex-wrap items-end gap-3 rounded-2xl p-3 md:p-4">
              <div className="flex min-w-36 items-center gap-2 self-center">
                <span className="readout grid size-8 place-items-center rounded-full bg-ice/15 text-sm font-semibold text-ice">{selected.size}</span>
                <span className="text-sm text-silver">{selected.size === 1 ? "OM selecionada" : "OMs selecionadas"}</span>
              </div>
              <label className="min-w-40 flex-1 space-y-1">
                <span className="text-xs text-steel">Técnico</span>
                <SelectField className={nativeSelectClass} value={techId} onChange={(e) => setTechId(e.target.value)}>
                  <option value="">Escolha o técnico</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </SelectField>
              </label>
              <label className="w-[calc(50%-0.375rem)] space-y-1 sm:w-40">
                <span className="text-xs text-steel">Data</span>
                <DateField className="h-9" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="w-[calc(50%-0.375rem)] space-y-1 sm:w-28">
                <span className="text-xs text-steel">Horário</span>
                <TimeField className="h-9" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button onClick={submit} disabled={pending} className="h-9 flex-1 sm:flex-none">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <UserRoundPlus className="size-4" />}
                  Atribuir técnico
                </Button>
                <Button variant="ghost" className="h-9" onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
                  <X className="size-4" />
                  <span className="sm:hidden">Limpar</span>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
