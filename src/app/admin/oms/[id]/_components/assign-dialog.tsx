"use client";

import { useActionState, useState } from "react";
import { CalendarClock, TriangleAlert, UserRoundPlus } from "lucide-react";
import { ActionForm, Field, FormSubmit, nativeSelectClass, useActionToast } from "@/components/system/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action";
import { formatDate } from "@/lib/format";
import { assignOmAction } from "../../actions";

export type Absence = { technicianId: string; startDate: string; endDate: string; reason: string | null };

function AssignForm({
  id,
  technicians,
  absences,
  initial,
  onDone,
}: {
  id: string;
  technicians: { id: string; name: string }[];
  absences: Absence[];
  initial: { technicianId: string | null; scheduledDate: string | null; scheduledTime: string | null };
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(assignOmAction.bind(null, id), initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const [tech, setTech] = useState(initial.technicianId ?? "");
  const [date, setDate] = useState(initial.scheduledDate ?? "");
  const conflict = absences.find((a) => a.technicianId === tech && date && date >= a.startDate && date <= a.endDate);
  const techName = technicians.find((t) => t.id === tech)?.name;

  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      <Field label="Técnico" htmlFor="assign-tech" error={state.fieldErrors?.technicianId}>
        <select id="assign-tech" name="technicianId" className={nativeSelectClass} value={tech} onChange={(e) => setTech(e.target.value)}>
          <option value="">Sem técnico</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
        <Field label="Data" htmlFor="assign-date" error={state.fieldErrors?.scheduledDate}>
          <Input id="assign-date" name="scheduledDate" type="date" className="h-9" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Horário" htmlFor="assign-time" error={state.fieldErrors?.scheduledTime}>
          <Input id="assign-time" name="scheduledTime" type="time" className="h-9" defaultValue={initial.scheduledTime?.slice(0, 5) ?? ""} />
        </Field>
      </div>
      {conflict && (
        <p className="flex gap-2 rounded-lg bg-brass/10 p-3 text-sm text-brass ring-1 ring-brass/30">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {techName} está ausente de {formatDate(conflict.startDate)} a {formatDate(conflict.endDate)}
            {conflict.reason ? ` (${conflict.reason})` : ""}. Confirme se quer manter esta data.
          </span>
        </p>
      )}
      {!tech && <p className="text-xs text-steel">Sem técnico, a OM volta para a fila de despacho como aberta.</p>}
      <DialogFooter className="-mx-4 -mb-4 mt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          Voltar
        </Button>
        <FormSubmit>{tech ? "Salvar agendamento" : "Remover técnico"}</FormSubmit>
      </DialogFooter>
    </ActionForm>
  );
}

export function AssignDialog({
  id,
  technicians,
  absences,
  initial,
  variant = "outline",
}: {
  id: string;
  technicians: { id: string; name: string }[];
  absences: Absence[];
  initial: { technicianId: string | null; scheduledDate: string | null; scheduledTime: string | null };
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const hasTech = Boolean(initial.technicianId);
  return (
    <>
      <Button variant={variant} className="h-9" onClick={() => setOpen(true)}>
        {hasTech ? <CalendarClock className="size-4" /> : <UserRoundPlus className="size-4" />}
        {hasTech ? "Reagendar" : "Atribuir técnico"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-sans text-base font-semibold">{hasTech ? "Reagendar OM" : "Atribuir técnico"}</DialogTitle>
            <DialogDescription>
              {hasTech ? "Troque o técnico, a data ou o horário. O técnico recebe um aviso." : "Escolha quem vai atender e quando. Com técnico e data, a OM fica agendada."}
            </DialogDescription>
          </DialogHeader>
          {open && <AssignForm id={id} technicians={technicians} absences={absences} initial={initial} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
