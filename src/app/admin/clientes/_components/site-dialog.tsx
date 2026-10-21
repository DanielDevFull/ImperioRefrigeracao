"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useActionToast } from "@/components/system/form";
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
import { saveSite } from "../actions";
import { PendingButton, useFormSubmit } from "./form-submit";
import { SiteFields, type SiteValues } from "./site-fields";

export function SiteDialog({
  customerId,
  site,
  isOnlySite = false,
}: {
  customerId: string;
  site?: SiteValues & { id: string; isPrimary: boolean };
  isOnlySite?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {site ? (
          <Button variant="ghost" size="sm">
            <Pencil />
            Editar
          </Button>
        ) : (
          <Button size="sm">
            <Plus />
            Adicionar local
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-rime bg-night p-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-silver">{site ? "Editar local" : "Novo local de atendimento"}</DialogTitle>
          <DialogDescription>
            Endereço onde ficam os equipamentos. Área e ocupantes entram no PMOC.
          </DialogDescription>
        </DialogHeader>
        <SiteForm customerId={customerId} site={site} isOnlySite={isOnlySite} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SiteForm({
  customerId,
  site,
  isOnlySite,
  onDone,
}: {
  customerId: string;
  site?: SiteValues & { id: string; isPrimary: boolean };
  isOnlySite: boolean;
  onDone: () => void;
}) {
  const { state, onSubmit, pending } = useFormSubmit(saveSite);
  useActionToast(state, { onSuccess: onDone });
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <input type="hidden" name="customerId" value={customerId} />
      {site && <input type="hidden" name="siteId" value={site.id} />}
      <SiteFields defaults={site ?? {}} errors={state.fieldErrors ?? {}} compact />
      {!site?.isPrimary && !isOnlySite && (
        <label className="flex items-center gap-2.5 text-sm text-silver">
          <input type="checkbox" name="isPrimary" className="size-4 accent-[var(--ice)]" />
          Usar como local principal do cliente
        </label>
      )}
      {state.error && !state.ok && (
        <p role="alert" className="text-sm text-gauge-red">
          {state.error}
        </p>
      )}
      <DialogFooter className="-mx-5 -mb-5 border-rime bg-glacier/40 px-5">
        <PendingButton pending={pending}>{site ? "Salvar local" : "Adicionar local"}</PendingButton>
      </DialogFooter>
    </form>
  );
}
