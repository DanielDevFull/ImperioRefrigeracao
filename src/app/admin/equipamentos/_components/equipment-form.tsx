"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ImageOff, Loader2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Field, nativeSelectClass, useActionToast } from "@/components/system/form";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { refrigerants } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { PendingButton, useFormSubmit } from "../../clientes/_components/form-submit";
import { saveEquipment, sitesForCustomer } from "../actions";

export type EquipmentFormValues = {
  id: string;
  customerId: string;
  siteId: string | null;
  typeId: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  capacityBtu: number | null;
  refrigerant: string | null;
  voltage: string | null;
  location: string | null;
  installDate: string | null;
  warrantyUntil: string | null;
  status: "ativo" | "inativo" | "em_manutencao" | "removido";
  notes: string | null;
  photoUrl: string | null;
};

type Site = { id: string; name: string; isPrimary: boolean };

const BTU_OPTIONS = [9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000];
const BRANDS = [
  "Samsung", "LG", "Midea", "Gree", "Daikin", "Fujitsu", "Springer", "Carrier", "Elgin", "Consul",
  "Electrolux", "Philco", "Hitachi", "Trane", "York", "Komeco", "Agratto", "TCL", "Bitzer", "Danfoss",
  "Embraco", "Tecumseh", "Gelopar", "Metalfrio", "Fricon",
];
const VOLTAGES = ["127 V", "220 V", "220 V trifásico", "380 V trifásico"];

const fmtBtu = (digits: string) => (digits ? Number(digits).toLocaleString("pt-BR") : "");

export function EquipmentForm({
  customers,
  types,
  initial,
  initialSites,
  defaultCustomerId,
}: {
  customers: { id: string; label: string; inactive: boolean }[];
  types: { id: string; name: string }[];
  initial?: EquipmentFormValues;
  initialSites: Site[];
  defaultCustomerId?: string;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const { state, onSubmit, pending } = useFormSubmit(saveEquipment);
  useActionToast(state, {
    onSuccess: () => {
      if (state.id) router.push(`/admin/equipamentos/${state.id}`);
    },
  });
  const fe = state.fieldErrors ?? {};

  const [customerId, setCustomerId] = useState(initial?.customerId ?? defaultCustomerId ?? "");
  const [sites, setSites] = useState<Site[]>(initialSites);
  const [siteId, setSiteId] = useState(
    initial ? (initial.siteId ?? "") : (initialSites.find((s) => s.isPrimary)?.id ?? initialSites[0]?.id ?? ""),
  );
  const [loadingSites, startSites] = useTransition();
  const [btu, setBtu] = useState(initial?.capacityBtu ? String(initial.capacityBtu) : "");
  const [refrigerant, setRefrigerant] = useState(initial?.refrigerant ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function changeCustomer(id: string) {
    setCustomerId(id);
    setSiteId("");
    setSites([]);
    if (!id) return;
    startSites(async () => {
      const list = await sitesForCustomer(id);
      setSites(list);
      setSiteId(list.find((s) => s.isPrimary)?.id ?? list[0]?.id ?? "");
    });
  }

  const r22 = /^r-?22$/i.test(refrigerant.trim());
  const currentPhoto = removePhoto ? null : (preview ?? initial?.photoUrl ?? null);

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate encType="multipart/form-data">
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <Panel title="Cliente e local" description="Onde o aparelho está instalado.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Cliente" htmlFor="customerId" error={fe.customerId} required>
            <select
              id="customerId"
              name="customerId"
              value={customerId}
              onChange={(e) => changeCustomer(e.target.value)}
              className={nativeSelectClass}
            >
              <option value="">Escolha o cliente</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.inactive ? " (inativo)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Local de atendimento"
            htmlFor="siteId"
            error={fe.siteId}
            hint={customerId && !loadingSites && sites.length === 0 ? "Cliente sem locais. Cadastre um na ficha do cliente." : undefined}
          >
            <div className="relative">
              <select
                id="siteId"
                name="siteId"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className={nativeSelectClass}
                disabled={!customerId || loadingSites}
              >
                <option value="">{customerId ? "Sem local definido" : "Escolha o cliente primeiro"}</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isPrimary ? " (principal)" : ""}
                  </option>
                ))}
              </select>
              {loadingSites && <Loader2 className="absolute right-8 top-2.5 size-4 animate-spin text-steel" />}
            </div>
          </Field>
          <Field
            label="Ambiente"
            htmlFor="location"
            error={fe.location}
            hint="Sala, setor ou cômodo: aparece na etiqueta"
            className="sm:col-span-2 lg:col-span-1"
          >
            <Input
              id="location"
              name="location"
              defaultValue={initial?.location ?? ""}
              placeholder="Sala de reunião, Cozinha, Recepção"
              className="h-9"
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Identificação">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tipo" htmlFor="typeId" error={fe.typeId}>
            <select id="typeId" name="typeId" defaultValue={initial?.typeId ?? ""} className={nativeSelectClass}>
              <option value="">Não informado</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Marca" htmlFor="brand" error={fe.brand}>
            <Input id="brand" name="brand" list="brand-options" defaultValue={initial?.brand ?? ""} className="h-9" placeholder="Samsung" />
            <datalist id="brand-options">
              {BRANDS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Modelo" htmlFor="model" error={fe.model}>
            <Input id="model" name="model" defaultValue={initial?.model ?? ""} className="h-9" placeholder="Wind-Free 12K" />
          </Field>
          <Field label="Número de série" htmlFor="serialNumber" error={fe.serialNumber}>
            <Input id="serialNumber" name="serialNumber" defaultValue={initial?.serialNumber ?? ""} className="h-9 font-mono text-[0.85rem]" />
          </Field>
        </div>
      </Panel>

      <Panel title="Especificações">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.7fr)_1fr_1fr]">
          <Field label="Capacidade (BTU/h)" htmlFor="capacityBtu" error={fe.capacityBtu} className="sm:col-span-2 lg:col-span-1">
            <Input
              id="capacityBtu"
              name="capacityBtu"
              inputMode="numeric"
              value={fmtBtu(btu)}
              onChange={(e) => setBtu(e.target.value.replace(/\D/g, "").slice(0, 7))}
              placeholder="12.000"
              className="h-9 tabular-nums"
            />
            <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Capacidades comuns">
              {BTU_OPTIONS.map((o) => {
                const active = btu === String(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setBtu(String(o))}
                    aria-pressed={active}
                    className={cn(
                      "rounded-md px-1.5 py-1 text-xs tabular-nums ring-1 transition-colors",
                      active ? "bg-ice/15 text-silver ring-ice/40" : "text-steel ring-rime hover:text-silver hover:ring-rime-strong",
                    )}
                  >
                    {(o / 1000).toLocaleString("pt-BR")} mil
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Fluido refrigerante" htmlFor="refrigerant" error={fe.refrigerant}>
            <Input
              id="refrigerant"
              name="refrigerant"
              list="refrigerant-options"
              value={refrigerant}
              onChange={(e) => setRefrigerant(e.target.value)}
              placeholder="R-410A"
              className="h-9"
            />
            <datalist id="refrigerant-options">
              {refrigerants.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <AnimatePresence initial={false}>
              {r22 && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-1.5 overflow-hidden pt-1 text-xs text-brass"
                >
                  <TriangleAlert className="mt-px size-3.5 shrink-0" />
                  O R-22 (HCFC) está em eliminação no Brasil. Avalie retrofit ou substituição com o cliente.
                </motion.p>
              )}
            </AnimatePresence>
          </Field>
          <Field label="Tensão" htmlFor="voltage" error={fe.voltage}>
            <Input id="voltage" name="voltage" list="voltage-options" defaultValue={initial?.voltage ?? ""} placeholder="220 V" className="h-9" />
            <datalist id="voltage-options">
              {VOLTAGES.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </Field>
        </div>
      </Panel>

      <Panel title="Instalação, garantia e situação">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Data de instalação" htmlFor="installDate" error={fe.installDate}>
            <Input id="installDate" name="installDate" type="date" defaultValue={initial?.installDate ?? ""} className="h-9" />
          </Field>
          <Field label="Garantia até" htmlFor="warrantyUntil" error={fe.warrantyUntil}>
            <Input id="warrantyUntil" name="warrantyUntil" type="date" defaultValue={initial?.warrantyUntil ?? ""} className="h-9" />
          </Field>
          {editing ? (
            <Field label="Situação" htmlFor="status" error={fe.status} className="sm:col-span-2">
              <select id="status" name="status" defaultValue={initial?.status ?? "ativo"} className={nativeSelectClass}>
                <option value="ativo">Ativo</option>
                <option value="em_manutencao">Em manutenção</option>
                <option value="inativo">Inativo (desligado no local)</option>
                {initial?.status === "removido" && <option value="removido">Removido</option>}
              </select>
            </Field>
          ) : (
            <input type="hidden" name="status" value="ativo" />
          )}
          <Field label="Observações" htmlFor="notes" error={fe.notes} className="sm:col-span-2 lg:col-span-4">
            <Textarea
              id="notes"
              name="notes"
              defaultValue={initial?.notes ?? ""}
              rows={3}
              placeholder="Acesso à condensadora, histórico de defeitos, peças trocadas…"
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Foto" description="Uma foto da evaporadora ou da plaqueta ajuda o técnico a reconhecer o aparelho.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="grid size-36 shrink-0 place-items-center overflow-hidden rounded-xl bg-night ring-1 ring-rime">
            {currentPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentPhoto} alt="Foto do equipamento" className="size-full object-cover" />
            ) : (
              <ImageOff className="size-7 text-steel/60" />
            )}
          </div>
          <div className="space-y-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-input/30 px-3 py-2 text-sm text-silver transition-colors hover:bg-input/50">
              <Camera className="size-4" />
              {initial?.photoUrl || preview ? "Trocar foto" : "Escolher foto"}
              <input
                type="file"
                name="photo"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setRemovePhoto(false);
                  setPreview(f ? URL.createObjectURL(f) : null);
                }}
              />
            </label>
            <p className="text-xs text-steel">JPG, PNG, WEBP ou HEIC, até 8 MB.</p>
            {fe.photo && <p className="text-xs text-gauge-red">{fe.photo}</p>}
            {initial?.photoUrl && !preview && (
              <label className="flex items-center gap-2 text-xs text-steel">
                <input
                  type="checkbox"
                  name="removePhoto"
                  checked={removePhoto}
                  onChange={(e) => setRemovePhoto(e.target.checked)}
                  className="size-3.5 accent-[var(--ice)]"
                />
                Remover a foto atual
              </label>
            )}
          </div>
        </div>
      </Panel>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-rime bg-night/90 px-3 py-2.5 shadow-[0_20px_40px_-12px_rgb(0_0_0/0.7)] backdrop-blur-xl sm:px-4 sm:py-3">
        {state.error && !state.ok && (
          <p role="alert" className="w-full text-sm text-gauge-red sm:mr-auto sm:w-auto">
            {state.error}
          </p>
        )}
        <Button asChild variant="ghost" size="lg">
          <Link href={initial ? `/admin/equipamentos/${initial.id}` : customerId ? `/admin/clientes/${customerId}?tab=equipamentos` : "/admin/equipamentos"}>
            Cancelar
          </Link>
        </Button>
        <PendingButton pending={pending} className="px-5">
          {editing ? "Salvar equipamento" : "Cadastrar equipamento"}
        </PendingButton>
      </div>
    </form>
  );
}
