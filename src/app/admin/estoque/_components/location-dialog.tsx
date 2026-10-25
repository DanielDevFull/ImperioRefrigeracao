"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, nativeSelectClass, useActionToast, ActionForm, FormSubmit } from "@/components/system/form";
import { initialActionState } from "@/lib/action";
import { saveLocation } from "../actions";
import { DialogActions, FormDialog } from "./form-dialog";
import { SelectField } from "@/components/system/fields";

type Tech = { id: string; name: string; vehiclePlate: string | null };
type Loc = { id: string; name: string; type: "almoxarifado" | "veiculo"; technicianId: string | null };

export function LocationDialog({ location, technicians }: { location?: Loc; technicians: Tech[] }) {
  return (
    <FormDialog
      title={location ? "Editar local" : "Novo local de estoque"}
      description={
        location
          ? undefined
          : "Um almoxarifado guarda o estoque central; um veículo leva o kit do técnico e recebe as baixas das OMs dele."
      }
      trigger={
        location ? (
          <Button size="icon-sm" variant="ghost" aria-label={`Editar ${location.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus />
            Novo local
          </Button>
        )
      }
    >
      {(close) => <LocationForm location={location} technicians={technicians} onDone={close} />}
    </FormDialog>
  );
}

function LocationForm({ location, technicians, onDone }: { location?: Loc; technicians: Tech[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveLocation, initialActionState);
  useActionToast(state, { onSuccess: onDone });
  const [type, setType] = useState<Loc["type"]>(location?.type ?? "veiculo");
  const [techId, setTechId] = useState(location?.technicianId ?? "");
  const [name, setName] = useState(location?.name ?? "");
  const [touched, setTouched] = useState(Boolean(location));
  const e = state.fieldErrors ?? {};

  const suggest = (t: string, tid: string) => {
    if (touched) return;
    const tech = technicians.find((x) => x.id === tid);
    if (t === "veiculo" && tech) setName(`Veículo ${tech.vehiclePlate ?? ""} — ${tech.name.split(" ")[0]}`.replace("  ", " "));
    if (t === "almoxarifado") setName("");
  };

  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      {location && <input type="hidden" name="id" value={location.id} />}
      <Field label="Tipo" required error={e.type} htmlFor="lc-type">
        <SelectField
          id="lc-type"
          name="type"
          value={type}
          onChange={(ev) => {
            const t = ev.target.value as Loc["type"];
            setType(t);
            suggest(t, techId);
          }}
          className={nativeSelectClass}
        >
          <option value="almoxarifado">Almoxarifado</option>
          <option value="veiculo">Veículo de técnico</option>
        </SelectField>
      </Field>
      {type === "veiculo" && (
        <Field label="Técnico" required error={e.technicianId} htmlFor="lc-tech" hint="As baixas de material das OMs desse técnico saem deste local.">
          <SelectField
            id="lc-tech"
            name="technicianId"
            value={techId}
            onChange={(ev) => {
              setTechId(ev.target.value);
              suggest(type, ev.target.value);
            }}
            className={nativeSelectClass}
          >
            <option value="">Escolha o técnico</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.vehiclePlate ? ` (${t.vehiclePlate})` : ""}
              </option>
            ))}
          </SelectField>
        </Field>
      )}
      <Field label="Nome" required error={e.name} htmlFor="lc-name">
        <Input
          id="lc-name"
          name="name"
          value={name}
          onChange={(ev) => {
            setName(ev.target.value);
            setTouched(true);
          }}
          className="h-9"
          placeholder={type === "almoxarifado" ? "Ex.: Almoxarifado central" : "Ex.: Veículo ABC-1D23 — Rafael"}
        />
      </Field>
      <DialogActions>
        <FormSubmit>{location ? "Salvar local" : "Criar local"}</FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}
