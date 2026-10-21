"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Lock, TriangleAlert } from "lucide-react";
import { Field, nativeSelectClass } from "@/components/system/form";
import { WorkOrderStatusBadge, WorkOrderTypeBadge } from "@/components/system/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDate, formatOM } from "@/lib/format";
import { LOCKED, absenceOn, type BoardItem, type BoardTechnician } from "../_lib/board";

export type MoveTarget = { technicianId: string | null; date: string | null; time?: string | null };

function MoveForm({
  item,
  technicians,
  onMove,
  onClose,
}: {
  item: BoardItem;
  technicians: BoardTechnician[];
  onMove: (id: string, target: MoveTarget) => void;
  onClose: () => void;
}) {
  const [tech, setTech] = useState(item.technicianId ?? "");
  const [date, setDate] = useState(item.scheduledDate ?? "");
  const [time, setTime] = useState(item.scheduledTime ?? "");
  const t = technicians.find((x) => x.id === tech);
  const abs = t && date ? absenceOn(t, date) : null;
  const changed = tech !== (item.technicianId ?? "") || date !== (item.scheduledDate ?? "") || time !== (item.scheduledTime ?? "");

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onMove(item.id, { technicianId: tech || null, date: date || null, time: time || null });
        onClose();
      }}
    >
      <Field label="Técnico" htmlFor="move-tech">
        <select id="move-tech" className={nativeSelectClass} value={tech} onChange={(e) => setTech(e.target.value)}>
          <option value="">Sem técnico (volta para a fila)</option>
          {technicians.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
        <Field label="Data" htmlFor="move-date">
          <Input id="move-date" type="date" className="h-9" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Horário" htmlFor="move-time">
          <Input id="move-time" type="time" className="h-9" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      {abs && (
        <p className="flex gap-2 rounded-lg bg-brass/10 p-3 text-sm text-brass ring-1 ring-brass/30">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {t?.name} está ausente de {formatDate(abs.startDate)} a {formatDate(abs.endDate)}
          {abs.reason ? ` (${abs.reason})` : ""}.
        </p>
      )}
      {time && !date && <p className="text-xs text-gauge-red">Informe a data para usar um horário.</p>}
      <DialogFooter className="-mx-4 -mb-4">
        <Button type="button" variant="ghost" asChild>
          <Link href={`/admin/oms/${item.id}`}>
            <ExternalLink className="size-4" />
            Abrir OM
          </Link>
        </Button>
        <Button type="submit" disabled={!changed || (!!time && !date)}>
          Salvar agendamento
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MoveDialog({
  item,
  technicians,
  onMove,
  onClose,
}: {
  item: BoardItem | null;
  technicians: BoardTechnician[];
  onMove: (id: string, target: MoveTarget) => void;
  onClose: () => void;
}) {
  const locked = item ? LOCKED.has(item.status) : false;
  return (
    <Dialog open={item != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="font-sans text-base font-semibold">
                <span className="readout text-frost">{formatOM(item.number)}</span> {item.customerName}
              </DialogTitle>
              <DialogDescription className="text-silver/80">{item.title}</DialogDescription>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <WorkOrderStatusBadge status={item.status} />
                <WorkOrderTypeBadge type={item.type} />
              </div>
              {item.equipmentLabel && <p className="text-xs text-steel">{item.equipmentLabel}</p>}
            </DialogHeader>
            {locked ? (
              <>
                <p className="flex gap-2 rounded-lg bg-night/60 p-3 text-sm text-steel ring-1 ring-rime">
                  <Lock className="mt-0.5 size-4 shrink-0" />
                  {item.status === "concluida"
                    ? "OM concluída: não pode ser movida."
                    : "O técnico já está em campo com esta OM. Para trocar, pause ou cancele o atendimento na ficha da OM."}
                </p>
                <DialogFooter className="-mx-4 -mb-4">
                  <Button asChild>
                    <Link href={`/admin/oms/${item.id}`}>
                      <ExternalLink className="size-4" />
                      Abrir OM
                    </Link>
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <MoveForm key={item.id} item={item} technicians={technicians} onMove={onMove} onClose={onClose} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
