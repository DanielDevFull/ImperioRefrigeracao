"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, KeyRound, Package, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, useActionToast } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Panel } from "@/components/system/panel";
import { cn } from "@/lib/utils";
import { createTechnician, updateTechnician } from "../actions";
import { DEFAULT_TECH_COLOR, SKILL_PRESETS, TECH_COLORS, normalizePlate, vehicleLocationName } from "../_lib/constants";
import { FormError, PendingButton, TempPasswordInput, generatePassword, useFormAction } from "./form-kit";
import { PlateTag, TechAvatar } from "./tech-avatar";

export type TechnicianFormValues = {
  id?: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  color: string;
  skills: string[];
  vehiclePlate: string | null;
  admissionDate: string | null;
  notes: string | null;
};

export function TechnicianForm({ technician }: { technician?: TechnicianFormValues }) {
  const editing = Boolean(technician?.id);
  const router = useRouter();
  const technicianId = technician?.id;
  const action = useMemo(
    () => (technicianId ? updateTechnician.bind(null, technicianId) : createTechnician),
    [technicianId],
  );
  const { state, onSubmit, pending } = useFormAction(action);
  useActionToast(state, {
    onSuccess: () => {
      if (state.id) router.push(`/admin/tecnicos/${state.id}`);
    },
  });
  const err = (k: string) => state.fieldErrors?.[k];

  const [name, setName] = useState(technician?.name ?? "");
  const [email, setEmail] = useState(technician?.email ?? "");
  const [color, setColor] = useState(technician?.color ?? DEFAULT_TECH_COLOR);
  const [plate, setPlate] = useState(technician?.vehiclePlate ?? "");
  const [withAccess, setWithAccess] = useState(false);
  const [accessEmail, setAccessEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [withStock, setWithStock] = useState(true);
  const plateValue = normalizePlate(plate) ?? "";
  const stockOn = withStock && Boolean(plateValue);

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]" noValidate>
      <div className="min-w-0 space-y-6">
        <Panel title="Dados do técnico">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" htmlFor="name" required error={err("name")} className="sm:col-span-2">
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                aria-invalid={Boolean(err("name")) || undefined}
                placeholder="Ex.: Rafael Nogueira"
              />
            </Field>
            <Field label="Celular (WhatsApp)" htmlFor="phone" error={err("phone")}>
              <MaskedInput
                mask="phone"
                id="phone"
                name="phone"
                defaultValue={technician?.phone ?? undefined}
                placeholder="(11) 90000-0000"
                aria-invalid={Boolean(err("phone")) || undefined}
              />
            </Field>
            <Field label="E-mail" htmlFor="email" error={err("email")}>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@imperiumtec.com.br"
                aria-invalid={Boolean(err("email")) || undefined}
              />
            </Field>
            <Field label="CPF" htmlFor="document" error={err("document")}>
              <MaskedInput
                mask="cpf"
                id="document"
                name="document"
                defaultValue={technician?.document ?? undefined}
                placeholder="000.000.000-00"
                maxLength={14}
                aria-invalid={Boolean(err("document")) || undefined}
              />
            </Field>
            <Field label="Data de admissão" htmlFor="admissionDate" error={err("admissionDate")}>
              <Input id="admissionDate" name="admissionDate" type="date" defaultValue={technician?.admissionDate ?? ""} />
            </Field>
          </div>
        </Panel>

        <Panel title="Especialidades" description="Ajudam a escolher o técnico certo ao atribuir uma OM.">
          <SkillsInput initial={technician?.skills ?? []} />
          {err("skills") && <p className="mt-2 text-xs text-gauge-red">{err("skills")}</p>}
        </Panel>

        <Panel title="Observações">
          <Textarea
            name="notes"
            defaultValue={technician?.notes ?? ""}
            rows={4}
            placeholder="Certificações (NR-10, NR-35), restrições de horário, tamanho de uniforme…"
          />
          {err("notes") && <p className="mt-2 text-xs text-gauge-red">{err("notes")}</p>}
        </Panel>
      </div>

      <div className="min-w-0 space-y-6">
        <Panel title="Cor na agenda" description="Identifica o técnico na agenda, nas OMs e nos avatares.">
          <ColorPicker value={color} onChange={setColor} />
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-night/60 px-3 py-2.5 ring-1 ring-rime">
            <TechAvatar name={name || "Novo técnico"} color={color} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-silver">{name || "Novo técnico"}</span>
            <span className="h-5 w-1 rounded-full" style={{ background: color }} />
          </div>
        </Panel>

        <Panel title="Veículo">
          <Field
            label="Placa"
            htmlFor="vehiclePlate"
            error={err("vehiclePlate")}
            hint="Formato ABC-1234 ou Mercosul ABC-1D23."
          >
            <Input
              id="vehiclePlate"
              name="vehiclePlate"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              maxLength={8}
              className="font-mono uppercase tracking-[0.08em]"
              placeholder="ABC-1D23"
              aria-invalid={Boolean(err("vehiclePlate")) || undefined}
            />
          </Field>
          {!editing && (
            <div className="mt-4 rounded-lg bg-night/50 p-3 ring-1 ring-rime">
              <label className="flex items-start gap-3">
                <Switch
                  checked={stockOn}
                  disabled={!plateValue}
                  onCheckedChange={setWithStock}
                  className="mt-0.5"
                  aria-label="Criar estoque do veículo"
                />
                <span className="min-w-0 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-silver">
                    <Package className="size-3.5 text-ice" />
                    Criar estoque do veículo
                  </span>
                  <span className="mt-0.5 block text-xs text-steel">
                    {plateValue
                      ? `Local "${vehicleLocationName(plateValue, name || "Técnico")}" para os materiais que ele leva.`
                      : "Informe a placa para criar o estoque embarcado."}
                  </span>
                </span>
              </label>
              <input type="hidden" name="createStock" value={stockOn ? "on" : ""} />
            </div>
          )}
          {editing && plateValue && (
            <p className="mt-3 flex items-center gap-2 text-xs text-steel">
              <PlateTag plate={plateValue} /> o nome do estoque do veículo acompanha a placa.
            </p>
          )}
        </Panel>

        {!editing ? (
          <Panel title="Acesso ao app">
            <label className="flex items-start gap-3">
              <Switch
                checked={withAccess}
                onCheckedChange={(on) => {
                  setWithAccess(on);
                  if (on && !password) setPassword(generatePassword());
                }}
                className="mt-0.5"
                aria-label="Criar acesso ao app"
              />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-medium text-silver">
                  <KeyRound className="size-3.5 text-ice" />
                  Criar acesso ao app
                </span>
                <span className="mt-0.5 block text-xs text-steel">
                  O técnico vê a agenda, executa as OMs e acompanha os ganhos no celular.
                </span>
              </span>
            </label>
            <input type="hidden" name="createAccess" value={withAccess ? "on" : ""} />
            <AnimatePresence initial={false}>
              {withAccess && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 pt-4">
                    <Field label="E-mail de login" htmlFor="accessEmail" required error={err("accessEmail")}>
                      <Input
                        id="accessEmail"
                        name="accessEmail"
                        type="email"
                        inputMode="email"
                        value={accessEmail ?? email}
                        onChange={(e) => setAccessEmail(e.target.value)}
                        placeholder="nome@imperiumtec.com.br"
                        aria-invalid={Boolean(err("accessEmail")) || undefined}
                      />
                    </Field>
                    <Field
                      label="Senha temporária"
                      htmlFor="accessPassword"
                      required
                      error={err("accessPassword")}
                      hint="Envie ao técnico pelo WhatsApp junto com o e-mail."
                    >
                      <TempPasswordInput
                        key={password}
                        id="accessPassword"
                        name="accessPassword"
                        defaultValue={password}
                        invalid={Boolean(err("accessPassword"))}
                      />
                    </Field>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>
        ) : (
          <p className="px-1 text-xs text-steel">
            Acesso ao app, ausências e estoque do veículo ficam no perfil do técnico.
          </p>
        )}

        <div className="space-y-3">
          <FormError state={state} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button asChild variant="ghost">
              <Link href={technician?.id ? `/admin/tecnicos/${technician.id}` : "/admin/tecnicos"}>Cancelar</Link>
            </Button>
            <PendingButton pending={pending} size="lg">
              {editing ? "Salvar alterações" : "Cadastrar técnico"}
            </PendingButton>
          </div>
        </div>
      </div>
    </form>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = TECH_COLORS.some((c) => c.value.toLowerCase() === value.toLowerCase());
  const options = known ? TECH_COLORS : [...TECH_COLORS, { value, label: "Atual" }];
  return (
    <fieldset>
      <legend className="sr-only">Cor do técnico</legend>
      <div className="grid grid-cols-8 gap-2">
        {options.map((c) => {
          const checked = c.value.toLowerCase() === value.toLowerCase();
          return (
            <label key={c.value} title={c.label} className="relative block max-w-9 cursor-pointer">
              <input
                type="radio"
                name="color"
                value={c.value}
                checked={checked}
                onChange={() => onChange(c.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "grid aspect-square w-full place-items-center rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-night transition-shadow peer-focus-visible:ring-frost",
                  // no claro, as cores mais pálidas (Geada, Prata) precisam de contorno para não sumir no branco
                  "light:shadow-[inset_0_0_0_1px_var(--rime-strong),0_2px_6px_-2px_var(--shade)]",
                  // no escuro a borda translúcida escurece sobre o fundo; no claro ela desbotaria no branco,
                  // então a borda da esfera ganha um pouco de tinta para manter o volume
                  "light:[--sw-fill:radial-gradient(circle_at_30%_25%,var(--sw),color-mix(in_srgb,var(--sw)_84%,var(--silver)))]",
                  checked && "ring-silver/80",
                )}
                style={
                  {
                    "--sw": c.value,
                    background: `var(--sw-fill, radial-gradient(circle at 30% 25%, ${c.value}, ${c.value}aa))`,
                  } as React.CSSProperties
                }
              >
                {/* a amostra é a cor do dado (igual nos dois temas): o check fica sempre em tinta escura */}
                {checked && <Check className="size-4 text-abyss light:text-silver" strokeWidth={3} />}
              </span>
              <span className="sr-only">{c.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SkillsInput({ initial }: { initial: string[] }) {
  const [skills, setSkills] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const custom = skills.filter((s) => !SKILL_PRESETS.includes(s));
  const toggle = (s: string) => setSkills((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const add = () => {
    const v = draft.trim().replace(/\s+/g, " ");
    if (!v) return;
    if (v.length > 40) {
      toast.error("Especialidade muito longa: use até 40 letras.");
      return;
    }
    const match =
      SKILL_PRESETS.find((p) => p.toLowerCase() === v.toLowerCase()) ??
      skills.find((p) => p.toLowerCase() === v.toLowerCase()) ??
      v;
    setSkills((cur) => (cur.includes(match) ? cur : [...cur, match]));
    setDraft("");
  };
  return (
    <div>
      {skills.map((s) => (
        <input key={s} type="hidden" name="skills" value={s} />
      ))}
      <div className="flex flex-wrap gap-2">
        {SKILL_PRESETS.map((s) => {
          const on = skills.includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition-colors",
                on ? "bg-ice/15 text-silver ring-ice/40" : "text-steel ring-rime hover:text-silver hover:ring-ice/25",
              )}
            >
              {on && <Check className="size-3.5 text-ice" />}
              {s}
            </button>
          );
        })}
        <AnimatePresence initial={false}>
          {custom.map((s) => (
            <motion.span
              key={s}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.18 }}
              className="inline-flex items-center gap-1 rounded-full bg-violet/12 py-1.5 pl-3 pr-1.5 text-sm text-silver ring-1 ring-inset ring-violet/35"
            >
              {s}
              <button
                type="button"
                onClick={() => toggle(s)}
                className="grid size-5 place-items-center rounded-full text-steel hover:bg-violet/20 hover:text-silver"
                aria-label={`Remover ${s}`}
              >
                <X className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-4 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Outra (ex.: Chiller)"
          aria-label="Outra especialidade"
          maxLength={40}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
          <Plus />
          Adicionar
        </Button>
      </div>
    </div>
  );
}
