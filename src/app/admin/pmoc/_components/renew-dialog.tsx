"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Field, useActionToast } from "@/components/system/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addDays, addMonths } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { PendingButton, useFormAction } from "@/app/admin/configuracoes/_components/form-kit";
import { renewPmoc } from "../actions";
import { DateField } from "@/components/system/fields";

const plus12 = (from: string) => (/^\d{4}-\d{2}-\d{2}$/.test(from) ? addDays(addMonths(from, 12), -1) : "");

export function RenewDialog({
  id,
  current,
  today,
  variant = "outline",
}: {
  id: string;
  current: { validFrom: string; validUntil: string; responsibleName: string; responsibleRegistry: string | null };
  today: string;
  variant?: "outline" | "default";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <RefreshCw className="size-4" />
          Renovar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {open && <RenewForm id={id} current={current} today={today} onCancel={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RenewForm({
  id,
  current,
  today,
  onCancel,
}: {
  id: string;
  current: { validFrom: string; validUntil: string; responsibleName: string; responsibleRegistry: string | null };
  today: string;
  onCancel: () => void;
}) {
  const { state, onSubmit, pending } = useFormAction(renewPmoc.bind(null, id));
  useActionToast(state);
  const fe = state.fieldErrors ?? {};
  const nextDay = addDays(current.validUntil, 1);
  const initialFrom = nextDay < today ? today : nextDay;
  const [from, setFrom] = useState(initialFrom);
  const [until, setUntil] = useState(plus12(initialFrom));

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="font-sans text-base font-semibold text-silver">Renovar PMOC</DialogTitle>
        <DialogDescription>
          Cria o documento do próximo período com uma nova ART. O atual, válido até {formatDate(current.validUntil)}, fica no histórico.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Responsável técnico" htmlFor="rn-name" error={fe.responsibleName} className="sm:col-span-2" required>
          <Input id="rn-name" name="responsibleName" defaultValue={current.responsibleName} />
        </Field>
        <Field label="Registro (CREA/CFT)" htmlFor="rn-registry" error={fe.responsibleRegistry}>
          <Input id="rn-registry" name="responsibleRegistry" defaultValue={current.responsibleRegistry ?? ""} />
        </Field>
        <Field label="Número da nova ART" htmlFor="rn-art" error={fe.artNumber} required>
          <Input id="rn-art" name="artNumber" className="tabular-nums" aria-invalid={fe.artNumber ? true : undefined} autoFocus />
        </Field>
        <Field label="Válido a partir de" htmlFor="rn-from" error={fe.validFrom} required>
          <DateField
            id="rn-from"
            name="validFrom"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setUntil(plus12(e.target.value));
            }}
          />
        </Field>
        <Field label="Válido até" htmlFor="rn-until" error={fe.validUntil} required>
          <DateField id="rn-until" name="validUntil" value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <PendingButton pending={pending}>Renovar PMOC</PendingButton>
      </DialogFooter>
    </form>
  );
}
