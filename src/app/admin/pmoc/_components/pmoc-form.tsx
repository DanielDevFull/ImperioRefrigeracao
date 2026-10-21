"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Field, nativeSelectClass, useActionToast } from "@/components/system/form";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/action";
import { addDays, addMonths } from "@/lib/dates";
import { PendingButton, useFormAction } from "@/app/admin/configuracoes/_components/form-kit";
import type { CustomerOption, SiteOption } from "../_lib/form-data";

export type PmocFormValues = {
  customerId: string;
  siteId: string;
  responsibleName: string;
  responsibleRegistry: string;
  artNumber: string;
  validFrom: string;
  validUntil: string;
  notes: string;
};

const plus12 = (from: string) => (/^\d{4}-\d{2}-\d{2}$/.test(from) ? addDays(addMonths(from, 12), -1) : "");
const inv = (e?: string) => (e ? true : undefined);

export function PmocForm({
  action,
  initial,
  customers,
  sites,
  submitLabel,
  cancelHref,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  initial: PmocFormValues;
  customers: CustomerOption[];
  sites: SiteOption[];
  submitLabel: string;
  cancelHref: string;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  useActionToast(state);
  const fe = state.fieldErrors ?? {};

  const [customerId, setCustomerId] = useState(initial.customerId);
  const [siteId, setSiteId] = useState(initial.siteId);
  const [validFrom, setValidFrom] = useState(initial.validFrom);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [untilTouched, setUntilTouched] = useState(initial.validUntil !== plus12(initial.validFrom));

  const withPmoc = customers.filter((c) => c.pmocEquipment > 0);
  const others = customers.filter((c) => c.pmocEquipment === 0);
  const customerSitesList = useMemo(() => sites.filter((s) => s.customerId === customerId), [sites, customerId]);
  const customer = customers.find((c) => c.id === customerId);
  const site = sites.find((s) => s.id === siteId);
  const covered = customer ? (siteId ? (customer.pmocBySite[siteId] ?? 0) : customer.pmocEquipment) : 0;

  function chooseCustomer(id: string) {
    setCustomerId(id);
    const list = sites.filter((s) => s.customerId === id);
    setSiteId((list.find((s) => s.isPrimary) ?? list[0])?.id ?? "");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <Panel title="Ambiente climatizado" description="O cliente e o local (edificação) cobertos por este plano.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Cliente" htmlFor="customerId" error={fe.customerId} required>
              <select
                id="customerId"
                name="customerId"
                value={customerId}
                onChange={(e) => chooseCustomer(e.target.value)}
                className={nativeSelectClass}
                aria-invalid={inv(fe.customerId)}
              >
                <option value="" disabled>
                  Escolha o cliente
                </option>
                {withPmoc.length > 0 && (
                  <optgroup label="Com equipamentos em plano PMOC">
                    {withPmoc.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Demais clientes">
                  {others.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <Field
              label="Local"
              htmlFor="siteId"
              error={fe.siteId}
              hint={site?.address || (customerId && customerSitesList.length === 0 ? "Este cliente ainda não tem local cadastrado." : undefined)}
            >
              <select
                id="siteId"
                name="siteId"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className={nativeSelectClass}
                disabled={!customerId}
                aria-invalid={inv(fe.siteId)}
              >
                <option value="">Todos os locais do cliente</option>
                {customerSitesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isPrimary ? " (principal)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title="Responsável técnico" description="Engenheiro ou técnico habilitado que responde pelo plano perante a fiscalização.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome" htmlFor="responsibleName" error={fe.responsibleName} className="sm:col-span-2" required>
              <Input id="responsibleName" name="responsibleName" defaultValue={initial.responsibleName} aria-invalid={inv(fe.responsibleName)} />
            </Field>
            <Field label="Registro no conselho (CREA/CFT)" htmlFor="responsibleRegistry" error={fe.responsibleRegistry}>
              <Input id="responsibleRegistry" name="responsibleRegistry" defaultValue={initial.responsibleRegistry} placeholder="CREA-SP 0000000000" aria-invalid={inv(fe.responsibleRegistry)} />
            </Field>
            <Field label="Número da ART" htmlFor="artNumber" error={fe.artNumber} hint="Anotação de Responsabilidade Técnica deste período.">
              <Input id="artNumber" name="artNumber" defaultValue={initial.artNumber} className="tabular-nums" aria-invalid={inv(fe.artNumber)} />
            </Field>
          </div>
        </Panel>

        <Panel title="Vigência" description="O PMOC é revisado a cada 12 meses, com nova ART.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Válido a partir de" htmlFor="validFrom" error={fe.validFrom} required>
              <Input
                id="validFrom"
                name="validFrom"
                type="date"
                value={validFrom}
                onChange={(e) => {
                  setValidFrom(e.target.value);
                  if (!untilTouched) setValidUntil(plus12(e.target.value));
                }}
                aria-invalid={inv(fe.validFrom)}
              />
            </Field>
            <Field label="Válido até" htmlFor="validUntil" error={fe.validUntil} hint={untilTouched ? undefined : "Calculado para 12 meses."} required>
              <Input
                id="validUntil"
                name="validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => {
                  setValidUntil(e.target.value);
                  setUntilTouched(true);
                }}
                aria-invalid={inv(fe.validUntil)}
              />
            </Field>
            <Field label="Observações" htmlFor="notes" error={fe.notes} className="sm:col-span-2" hint="Aparecem no documento impresso.">
              <Textarea id="notes" name="notes" rows={3} defaultValue={initial.notes} placeholder="Ex.: atividade do local, horários de funcionamento, particularidades do sistema" />
            </Field>
          </div>
        </Panel>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <div className="panel p-5">
          {!customerId ? (
            <p className="text-sm text-steel">Escolha o cliente para ver os equipamentos que entram no documento.</p>
          ) : covered > 0 ? (
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-mint" />
              <div>
                <p className="text-sm font-medium text-silver">
                  {covered === 1 ? "1 equipamento entra no PMOC" : `${covered} equipamentos entram no PMOC`}
                </p>
                <p className="mt-1 text-sm text-steel">
                  São os aparelhos {siteId ? "deste local " : ""}em contrato com plano marcado como PMOC. As rotinas e o cronograma vêm desses planos.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-brass" />
              <div>
                <p className="text-sm font-medium text-silver">Nenhum equipamento em plano PMOC</p>
                <p className="mt-1 text-sm text-steel">
                  O documento pode ser criado, mas ficará sem equipamentos e sem cronograma. Inclua os aparelhos em um contrato com plano PMOC.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href={`/admin/contratos/novo?customerId=${customerId}`}>Criar contrato</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row-reverse xl:flex-col">
          <PendingButton pending={pending} size="lg" className="sm:flex-1 xl:flex-none">
            {submitLabel}
          </PendingButton>
          <Button asChild variant="outline" size="lg" className="sm:flex-1 xl:flex-none">
            <Link href={cancelHref}>Cancelar</Link>
          </Button>
        </div>
      </aside>
    </form>
  );
}
