"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy } from "lucide-react";
import { Field, useActionToast } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ActionState } from "@/lib/action";
import { addDays, todayISO, toWorkingDay, weekday } from "@/lib/dates";
import { formatDate, formatLongDate } from "@/lib/format";
import { buildPixPayload, sanitizePixText } from "@/lib/pix";
import { cn } from "@/lib/utils";
import {
  saveAutomation,
  saveBilling,
  saveCommission,
  saveCompany,
  savePix,
  savePmocResponsible,
} from "../actions";
import { PendingButton, useFormAction } from "./form-kit";

type Errors = Record<string, string>;

/** Formulário de uma seção: corpo + rodapé com o botão de salvar e uma nota opcional. */
function SectionForm({
  action,
  submitLabel,
  note,
  children,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  submitLabel: string;
  note?: React.ReactNode;
  children: (errors: Errors) => React.ReactNode;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  useActionToast(state);
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid gap-5 p-5">{children(state.fieldErrors ?? {})}</div>
      <div className="flex flex-col-reverse gap-3 border-t border-rime px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-steel">{note}</p>
        <PendingButton pending={pending} className="self-end sm:self-auto">
          {submitLabel}
        </PendingButton>
      </div>
    </form>
  );
}

const inv = (e?: string) => (e ? true : undefined);

/* ------------------------------------------------------------------ Empresa */

export function CompanyForm({
  initial,
}: {
  initial: {
    companyName: string;
    document: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
}) {
  return (
    <SectionForm action={saveCompany} submitLabel="Salvar dados da empresa" note="Aparecem no PMOC, nos relatórios de OM e no portal do cliente.">
      {(fe) => (
        <div className="grid gap-5 sm:grid-cols-6">
          <Field label="Razão social ou nome fantasia" htmlFor="companyName" error={fe.companyName} className="sm:col-span-4" required>
            <Input id="companyName" name="companyName" defaultValue={initial.companyName} aria-invalid={inv(fe.companyName)} />
          </Field>
          <Field label="CNPJ" htmlFor="document" error={fe.document} className="sm:col-span-2">
            <MaskedInput mask="cpfcnpj" id="document" name="document" defaultValue={initial.document ?? undefined} placeholder="00.000.000/0000-00" aria-invalid={inv(fe.document)} />
          </Field>
          <Field label="Telefone" htmlFor="phone" error={fe.phone} className="sm:col-span-2">
            <MaskedInput mask="phone" id="phone" name="phone" defaultValue={initial.phone ?? undefined} placeholder="(11) 0000-0000" aria-invalid={inv(fe.phone)} />
          </Field>
          <Field label="WhatsApp" htmlFor="whatsapp" error={fe.whatsapp} className="sm:col-span-2">
            <MaskedInput mask="phone" id="whatsapp" name="whatsapp" defaultValue={initial.whatsapp ?? undefined} placeholder="(11) 90000-0000" aria-invalid={inv(fe.whatsapp)} />
          </Field>
          <Field label="E-mail" htmlFor="email" error={fe.email} className="sm:col-span-2">
            <Input id="email" name="email" type="email" inputMode="email" defaultValue={initial.email ?? ""} aria-invalid={inv(fe.email)} />
          </Field>
          <Field label="Endereço" htmlFor="address" error={fe.address} className="sm:col-span-6">
            <Input id="address" name="address" defaultValue={initial.address ?? ""} placeholder="Rua, número e bairro" aria-invalid={inv(fe.address)} />
          </Field>
          <Field label="Cidade" htmlFor="city" error={fe.city} className="sm:col-span-4">
            <Input id="city" name="city" defaultValue={initial.city ?? ""} aria-invalid={inv(fe.city)} />
          </Field>
          <Field label="Estado (UF)" htmlFor="state" error={fe.state} className="sm:col-span-2">
            <Input id="state" name="state" defaultValue={initial.state ?? ""} maxLength={2} className="uppercase" placeholder="SP" aria-invalid={inv(fe.state)} />
          </Field>
        </div>
      )}
    </SectionForm>
  );
}

/* ---------------------------------------------------------------------- Pix */

export function PixForm({
  initial,
}: {
  initial: { pixKey: string | null; pixMerchantName: string | null; pixMerchantCity: string | null };
}) {
  const [key, setKey] = useState(initial.pixKey ?? "");
  const [name, setName] = useState(initial.pixMerchantName ?? "");
  const [city, setCity] = useState(initial.pixMerchantCity ?? "");
  const nameLen = sanitizePixText(name, 99).length;
  const cityLen = sanitizePixText(city, 99).length;

  return (
    <SectionForm
      action={savePix}
      submitLabel="Salvar recebimento por Pix"
      note="Deixe a chave em branco para não mostrar Pix nas mensalidades."
    >
      {(fe) => (
        <div className="grid gap-6 md:grid-cols-[1fr_15rem]">
          <div className="grid content-start gap-5">
            <Field
              label="Chave Pix"
              htmlFor="pixKey"
              error={fe.pixKey}
              hint="CPF, CNPJ, e-mail, telefone com +55 ou chave aleatória."
            >
              <Input id="pixKey" name="pixKey" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" aria-invalid={inv(fe.pixKey)} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
              <Field
                label="Nome do recebedor"
                htmlFor="pixMerchantName"
                error={fe.pixMerchantName}
                hint={`${nameLen}/25 caracteres, como aparece no app do banco.`}
              >
                <Input
                  id="pixMerchantName"
                  name="pixMerchantName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={inv(fe.pixMerchantName) || nameLen > 25 || undefined}
                />
              </Field>
              <Field label="Cidade do recebedor" htmlFor="pixMerchantCity" error={fe.pixMerchantCity} hint={`${cityLen}/15 caracteres.`}>
                <Input
                  id="pixMerchantCity"
                  name="pixMerchantCity"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  aria-invalid={inv(fe.pixMerchantCity) || cityLen > 15 || undefined}
                />
              </Field>
            </div>
            <div className="rounded-lg border border-rime bg-night/50 px-4 py-3 text-sm leading-relaxed text-steel">
              <p>
                O cliente paga pelo QR Code ou pelo Pix copia e cola da mensalidade e envia o comprovante pelo portal.
                A baixa é <span className="text-silver">confirmada manualmente</span> em Contas a receber, conferindo o extrato do banco.
              </p>
              <p className="mt-2">
                Para baixa automática, um gateway de pagamento (Asaas ou Efí) pode ser conectado depois, sem mudar a rotina dos clientes.
              </p>
            </div>
          </div>
          <PixPreview pixKey={key} name={name} city={city} />
        </div>
      )}
    </SectionForm>
  );
}

function PixPreview({ pixKey, name, city }: { pixKey: string; name: string; city: string }) {
  const payload = useMemo(() => {
    if (!pixKey.trim() || !name.trim() || !city.trim()) return null;
    return buildPixPayload({ key: pixKey, merchantName: name, merchantCity: city, amount: 1, txid: "TESTEIMPERIUM" });
  }, [pixKey, name, city]);
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!payload) return;
    QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { light: "#ffffff", dark: "#040914" } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [payload]);

  return (
    <div className="flex flex-col items-center rounded-xl border border-rime bg-night/40 p-4 text-center">
      <p className="text-sm font-medium text-silver">Teste de R$ 1,00</p>
      <p className="mt-0.5 text-xs text-steel">Leia no app do banco para conferir o recebedor</p>
      {/* QR sempre em papel branco; no claro ganha contorno para não se perder no cartão branco */}
      <div className="mt-3 grid size-44 place-items-center overflow-hidden rounded-lg bg-white p-1.5 light:shadow-[0_8px_20px_-12px_var(--shade)] light:ring-1 light:ring-rime">
        {payload && svg ? (
          <span role="img" aria-label="QR Code Pix de teste" className="block size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <span className="px-4 text-xs text-[#5b6b82]">Preencha chave, nome e cidade para ver o QR Code</span>
        )}
      </div>
      <button
        type="button"
        disabled={!payload}
        onClick={async () => {
          if (!payload) return;
          try {
            await navigator.clipboard.writeText(payload);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* sem permissão de área de transferência */
          }
        }}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-frost hover:text-ice disabled:opacity-40"
      >
        {copied ? <Check className="size-3.5 text-mint" /> : <Copy className="size-3.5" />}
        {copied ? "Copiado" : "Copiar Pix copia e cola"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ Cobrança */

export function BillingForm({
  initial,
}: {
  initial: { lateFinePercent: number; lateInterestMonthlyPercent: number; invoiceLeadDays: number; serviceDueDays: number };
}) {
  const [fine, setFine] = useState(String(initial.lateFinePercent).replace(".", ","));
  const [interest, setInterest] = useState(String(initial.lateInterestMonthlyPercent).replace(".", ","));
  const example = useMemo(() => {
    const f = Number(fine.replace(",", ".")) || 0;
    const i = Number(interest.replace(",", ".")) || 0;
    const base = 300;
    const total = base + (base * f) / 100 + base * (i / 100 / 30) * 10;
    return total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }, [fine, interest]);

  return (
    <SectionForm action={saveBilling} submitLabel="Salvar regras de cobrança">
      {(fe) => (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Multa por atraso (%)" htmlFor="lateFinePercent" error={fe.lateFinePercent} hint="Cobrada uma vez, no primeiro dia de atraso.">
              <Input id="lateFinePercent" name="lateFinePercent" inputMode="decimal" value={fine} onChange={(e) => setFine(e.target.value)} className="tabular-nums" aria-invalid={inv(fe.lateFinePercent)} />
            </Field>
            <Field label="Juros ao mês (%)" htmlFor="lateInterestMonthlyPercent" error={fe.lateInterestMonthlyPercent} hint="Proporcionais aos dias de atraso.">
              <Input id="lateInterestMonthlyPercent" name="lateInterestMonthlyPercent" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} className="tabular-nums" aria-invalid={inv(fe.lateInterestMonthlyPercent)} />
            </Field>
          </div>
          <p className="-mt-1 text-xs text-steel">
            Exemplo: uma mensalidade de R$ 300,00 paga com 10 dias de atraso fica em <span className="readout text-silver">{example}</span>.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Gerar a mensalidade com antecedência de (dias)"
              htmlFor="invoiceLeadDays"
              error={fe.invoiceLeadDays}
              hint="A mensalidade aparece no portal do cliente este número de dias antes do vencimento."
            >
              <Input id="invoiceLeadDays" name="invoiceLeadDays" type="number" min={1} max={60} defaultValue={initial.invoiceLeadDays} className="tabular-nums" aria-invalid={inv(fe.invoiceLeadDays)} />
            </Field>
            <Field
              label="Prazo para pagar serviços avulsos (dias)"
              htmlFor="serviceDueDays"
              error={fe.serviceDueDays}
              hint="Vencimento da cobrança criada ao concluir uma OM cobrada à parte."
            >
              <Input id="serviceDueDays" name="serviceDueDays" type="number" min={0} max={90} defaultValue={initial.serviceDueDays} className="tabular-nums" aria-invalid={inv(fe.serviceDueDays)} />
            </Field>
          </div>
        </>
      )}
    </SectionForm>
  );
}

/* ------------------------------------------------------- Geração automática */

function nextSaturday(from: string) {
  let d = from;
  for (let i = 0; i < 7 && weekday(d) !== 6; i++) d = addDays(d, 1);
  return d;
}

export function AutomationForm({
  initial,
}: {
  initial: { workOrderHorizonDays: number; worksSaturday: boolean; blockOverdueDays: number };
}) {
  const [horizon, setHorizon] = useState(String(initial.workOrderHorizonDays));
  const [saturday, setSaturday] = useState(initial.worksSaturday);
  const [block, setBlock] = useState(String(initial.blockOverdueDays));
  const today = todayISO();
  const h = Math.max(0, Math.min(120, Number(horizon) || 0));
  const b = Math.max(0, Number(block) || 0);
  const sat = nextSaturday(addDays(today, 1));

  return (
    <SectionForm action={saveAutomation} submitLabel="Salvar geração automática">
      {(fe) => (
        <div className="grid gap-6">
          <Rule
            title="Horizonte de geração"
            explanation={
              h > 0 ? (
                <>
                  As OMs preventivas dos contratos são criadas com {h} dias de antecedência. Hoje, entram na agenda as visitas previstas até{" "}
                  <span className="text-silver">{formatLongDate(addDays(today, h))}</span>.
                </>
              ) : (
                "Informe quantos dias à frente as OMs preventivas devem ser criadas."
              )
            }
          >
            <Field label="Dias à frente" htmlFor="workOrderHorizonDays" error={fe.workOrderHorizonDays} className="w-36">
              <Input id="workOrderHorizonDays" name="workOrderHorizonDays" type="number" min={7} max={120} value={horizon} onChange={(e) => setHorizon(e.target.value)} className="tabular-nums" aria-invalid={inv(fe.workOrderHorizonDays)} />
            </Field>
          </Rule>

          <Rule
            title="Atendimento aos sábados"
            explanation={
              saturday ? (
                <>Visitas que caem no sábado ficam no sábado. Domingos sempre passam para o sábado anterior.</>
              ) : (
                <>
                  Visitas que caem no sábado passam para a sexta-feira. Ex.: uma visita de {formatDate(sat)} vai para{" "}
                  <span className="text-silver">{formatDate(toWorkingDay(sat, false))}</span>. Domingos também voltam para o dia útil anterior.
                </>
              )
            }
          >
            <label htmlFor="worksSaturday" className="flex items-center gap-3 text-sm text-silver">
              <Switch id="worksSaturday" name="worksSaturday" checked={saturday} onCheckedChange={setSaturday} />
              {saturday ? "Atende aos sábados" : "Não atende aos sábados"}
            </label>
          </Rule>

          <Rule
            title="Bloqueio por inadimplência"
            explanation={
              b === 0 ? (
                "Desligado: as OMs preventivas são geradas mesmo para clientes com mensalidade vencida."
              ) : (
                <>
                  Clientes com mensalidade vencida há mais de <span className="text-silver">{b} dias</span> deixam de receber novas OMs preventivas
                  até regularizar. As OMs já criadas continuam na agenda.
                </>
              )
            }
          >
            <Field label="Dias de atraso" htmlFor="blockOverdueDays" error={fe.blockOverdueDays} hint="0 = nunca bloquear" className="w-36">
              <Input id="blockOverdueDays" name="blockOverdueDays" type="number" min={0} max={365} value={block} onChange={(e) => setBlock(e.target.value)} className="tabular-nums" aria-invalid={inv(fe.blockOverdueDays)} />
            </Field>
          </Rule>
        </div>
      )}
    </SectionForm>
  );
}

function Rule({ title, explanation, children }: { title: string; explanation: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-rime pb-6 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-8">
      <div className="min-w-0">
        <p className="text-sm font-medium text-silver">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-steel">{explanation}</p>
      </div>
      <div className="sm:pt-0.5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ Comissões */

const TRIGGERS = [
  {
    value: "conclusao",
    title: "Na conclusão da OM",
    text: "A comissão fica liberada para pagamento assim que o técnico conclui a OM.",
  },
  {
    value: "recebimento",
    title: "No recebimento do valor cobrado",
    text: "Em serviços cobrados à parte, a comissão só é liberada quando o cliente paga. Visitas de contrato seguem liberando na conclusão.",
  },
] as const;

export function CommissionForm({ initial }: { initial: { commissionTrigger: string } }) {
  const [value, setValue] = useState(initial.commissionTrigger);
  return (
    <SectionForm action={saveCommission} submitLabel="Salvar regra de comissão" note="Vale para as próximas OMs concluídas.">
      {(fe) => (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Quando liberar a comissão</legend>
          {TRIGGERS.map((t) => {
            const active = value === t.value;
            return (
              <label
                key={t.value}
                className={cn(
                  "relative flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                  active ? "border-ice/50 bg-ice/8" : "border-rime hover:border-rime-strong hover:bg-ice/4",
                )}
              >
                <input
                  type="radio"
                  name="commissionTrigger"
                  value={t.value}
                  checked={active}
                  onChange={() => setValue(t.value)}
                  className="mt-0.5 size-4 accent-[var(--ice)]"
                />
                <span>
                  <span className="block text-sm font-medium text-silver">{t.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-steel">{t.text}</span>
                </span>
              </label>
            );
          })}
          {fe.commissionTrigger && <p className="text-xs text-gauge-red">{fe.commissionTrigger}</p>}
        </fieldset>
      )}
    </SectionForm>
  );
}

/* ---------------------------------------------------------------------- PMOC */

export function PmocResponsibleForm({
  initial,
}: {
  initial: { pmocResponsibleName: string | null; pmocResponsibleRegistry: string | null; pmocResponsibleArt: string | null };
}) {
  return (
    <SectionForm
      action={savePmocResponsible}
      submitLabel="Salvar responsável técnico"
      note="Sugerido ao criar um novo PMOC; cada documento guarda os próprios dados."
    >
      {(fe) => (
        <div className="grid gap-5 sm:grid-cols-6">
          <Field label="Nome do responsável técnico" htmlFor="pmocResponsibleName" error={fe.pmocResponsibleName} className="sm:col-span-6">
            <Input id="pmocResponsibleName" name="pmocResponsibleName" defaultValue={initial.pmocResponsibleName ?? ""} placeholder="Eng. Nome Sobrenome" aria-invalid={inv(fe.pmocResponsibleName)} />
          </Field>
          <Field label="Registro no conselho (CREA/CFT)" htmlFor="pmocResponsibleRegistry" error={fe.pmocResponsibleRegistry} className="sm:col-span-3">
            <Input id="pmocResponsibleRegistry" name="pmocResponsibleRegistry" defaultValue={initial.pmocResponsibleRegistry ?? ""} placeholder="CREA-SP 0000000000" aria-invalid={inv(fe.pmocResponsibleRegistry)} />
          </Field>
          <Field label="Número da ART padrão" htmlFor="pmocResponsibleArt" error={fe.pmocResponsibleArt} className="sm:col-span-3">
            <Input id="pmocResponsibleArt" name="pmocResponsibleArt" defaultValue={initial.pmocResponsibleArt ?? ""} className="tabular-nums" aria-invalid={inv(fe.pmocResponsibleArt)} />
          </Field>
        </div>
      )}
    </SectionForm>
  );
}
