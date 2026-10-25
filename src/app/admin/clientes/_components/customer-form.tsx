"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { Field, nativeSelectClass, useActionToast } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeDocument } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveCustomer } from "../actions";
import { documentError } from "../_lib/document";
import { PendingButton, useFormSubmit } from "./form-submit";
import { SiteFields } from "./site-fields";
import { SelectField } from "@/components/system/fields";

export type CustomerFormValues = {
  id?: string;
  personType: "pf" | "pj";
  name: string;
  tradeName: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  defaultTechnicianId: string | null;
  notes: string | null;
  status: "ativo" | "inativo";
};

const TYPES = [
  { value: "pj", label: "Pessoa jurídica", icon: Building2 },
  { value: "pf", label: "Pessoa física", icon: UserRound },
] as const;

export function CustomerForm({
  initial,
  technicians,
}: {
  initial?: CustomerFormValues;
  technicians: { id: string; name: string }[];
}) {
  const router = useRouter();
  const editing = Boolean(initial?.id);
  const { state, onSubmit, pending } = useFormSubmit(saveCustomer);
  const [personType, setPersonType] = useState<"pf" | "pj">(initial?.personType ?? "pj");
  const [docHint, setDocHint] = useState<string | null>(null);
  const [sameWhats, setSameWhats] = useState(false);
  useActionToast(state, {
    onSuccess: () => {
      if (state.id) router.push(`/admin/clientes/${state.id}`);
    },
  });
  const fe = state.fieldErrors ?? {};
  const pj = personType === "pj";

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="personType" value={personType} />

      <Panel title="Identificação" description="Quem é o cliente e como ele aparece nas OMs e cobranças.">
        <div className="space-y-5">
          <div
            role="radiogroup"
            aria-label="Tipo de pessoa"
            className="inline-grid w-full grid-cols-2 gap-1 rounded-xl bg-night/70 p-1 ring-1 ring-rime sm:w-auto"
          >
            {TYPES.map((t) => {
              const active = personType === t.value;
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setPersonType(t.value);
                    setDocHint(null);
                  }}
                  className={cn(
                    "relative flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors",
                    active ? "text-silver" : "text-steel hover:text-silver",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="person-type-active"
                      className="absolute inset-0 rounded-lg bg-ice/15 ring-1 ring-ice/30"
                      transition={{ type: "spring", stiffness: 450, damping: 36 }}
                    />
                  )}
                  <Icon className={cn("relative size-4", active ? "text-ice" : "text-steel/80")} />
                  <span className="relative">{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
            <Field
              label={pj ? "Razão social" : "Nome completo"}
              htmlFor="name"
              error={fe.name}
              className="sm:col-span-2 lg:col-span-5"
              required
            >
              <Input
                id="name"
                name="name"
                defaultValue={initial?.name ?? ""}
                placeholder={pj ? "Clínica Exemplo Ltda" : "Maria da Silva"}
                className="h-9"
                autoComplete="off"
              />
            </Field>
            {pj && (
              <Field
                label="Nome fantasia"
                htmlFor="tradeName"
                error={fe.tradeName}
                hint="Aparece na etiqueta QR e no portal"
                className="lg:col-span-4"
              >
                <Input
                  id="tradeName"
                  name="tradeName"
                  defaultValue={initial?.tradeName ?? ""}
                  placeholder="Clínica Exemplo"
                  className="h-9"
                />
              </Field>
            )}
            <Field
              label={pj ? "CNPJ" : "CPF"}
              htmlFor="document"
              error={fe.document ?? docHint ?? undefined}
              className={pj ? "lg:col-span-3" : "lg:col-span-4"}
            >
              <MaskedInput
                key={personType}
                id="document"
                name="document"
                mask={pj ? "cnpj" : "cpf"}
                defaultValue={initial?.personType === personType ? (initial?.document ?? "") : ""}
                placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"}
                className="h-9 tabular-nums"
                onBlur={(e) => {
                  const original = normalizeDocument(initial?.document);
                  const doc = normalizeDocument(e.currentTarget.value);
                  setDocHint(doc && doc !== original ? documentError(personType, doc) : null);
                }}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Contato" description="Usados para avisos de visita, cobranças e o botão de WhatsApp.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="E-mail" htmlFor="email" error={fe.email}>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              defaultValue={initial?.email ?? ""}
              placeholder="contato@cliente.com.br"
              className="h-9"
            />
          </Field>
          <Field label="Telefone" htmlFor="phone" error={fe.phone}>
            <MaskedInput
              id="phone"
              name="phone"
              mask="phone"
              defaultValue={initial?.phone ?? undefined}
              placeholder="(11) 0000-0000"
              className="h-9 tabular-nums"
            />
          </Field>
          <Field
            label="WhatsApp"
            htmlFor="whatsapp"
            error={fe.whatsapp}
            hint={sameWhats ? "Usaremos o mesmo número do telefone" : undefined}
          >
            {sameWhats ? (
              <Input id="whatsapp" disabled value="Mesmo do telefone" className="h-9 text-steel" readOnly />
            ) : (
              <MaskedInput
                id="whatsapp"
                name="whatsapp"
                mask="phone"
                defaultValue={initial?.whatsapp ?? undefined}
                placeholder="(11) 90000-0000"
                className="h-9 tabular-nums"
              />
            )}
            <label className="mt-1.5 flex items-center gap-2 text-xs text-steel">
              <input
                type="checkbox"
                name="whatsappSame"
                checked={sameWhats}
                onChange={(e) => setSameWhats(e.target.checked)}
                className="size-3.5 accent-[var(--ice)]"
              />
              É o mesmo número do telefone
            </label>
          </Field>
        </div>
      </Panel>

      <Panel title="Atendimento">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Técnico preferencial"
            htmlFor="defaultTechnicianId"
            error={fe.defaultTechnicianId}
            hint="Recebe as OMs deste cliente quando o contrato não indica outro"
          >
            <SelectField
              id="defaultTechnicianId"
              name="defaultTechnicianId"
              defaultValue={initial?.defaultTechnicianId ?? ""}
              className={nativeSelectClass}
            >
              <option value="">Sem preferência</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectField>
          </Field>
          {editing && (
            <Field
              label="Situação"
              htmlFor="status"
              hint="Clientes inativos não recebem OMs automáticas"
            >
              <SelectField id="status" name="status" defaultValue={initial?.status ?? "ativo"} className={nativeSelectClass}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </SelectField>
            </Field>
          )}
          <Field label="Observações" htmlFor="notes" error={fe.notes} className="sm:col-span-2 lg:col-span-3">
            <Textarea
              id="notes"
              name="notes"
              defaultValue={initial?.notes ?? ""}
              rows={3}
              placeholder="Preferências de horário, contato do zelador, particularidades do cliente…"
            />
          </Field>
        </div>
      </Panel>

      {!editing && (
        <Panel
          title="Local de atendimento"
          description="O primeiro endereço do cliente. Você pode adicionar outros locais depois, na ficha."
        >
          <SiteFields prefix="site." errors={fe} />
        </Panel>
      )}

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-rime bg-night/90 px-3 py-2.5 shadow-[0_20px_40px_-12px_var(--shade)] backdrop-blur-xl sm:px-4 sm:py-3">
        {state.error && !state.ok && (
          <p role="alert" className="w-full text-sm text-gauge-red sm:mr-auto sm:w-auto">
            {state.error}
          </p>
        )}
        <Button asChild variant="ghost" size="lg">
          <Link href={initial?.id ? `/admin/clientes/${initial.id}` : "/admin/clientes"}>Cancelar</Link>
        </Button>
        <PendingButton pending={pending} className="px-5">
          {editing ? "Salvar cliente" : "Cadastrar cliente"}
        </PendingButton>
      </div>
    </form>
  );
}
