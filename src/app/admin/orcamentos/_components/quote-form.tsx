"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { CircleCheck, Loader2, MapPin, Package, Plus, ReceiptText, Trash2, UserRound, Wrench } from "lucide-react";
import { DateField, SelectField } from "@/components/system/fields";
import { ActionForm, Field, FormSubmit, nativeSelectClass, useActionToast } from "@/components/system/form";
import { applyMask } from "@/components/system/masked-input";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { formatBRL, formatDate } from "@/lib/format";
import { labelOf, workOrderType } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { discountFits, quoteTotals } from "@/server/core/quotes";
import { Segmented } from "../../oms/_components/segmented";
import { WORK_ORDER_TYPES } from "../../oms/_lib/constants";
import { CustomerPicker, type CustomerOption } from "../../oms/nova/_components/customer-picker";
import { quoteCustomerAction, saveQuote } from "../actions";
import { QUOTE_UNITS, omTypePhrase } from "../_lib/defaults";
import { moneyText, parseDecimal, qtyText, sanitizeQty } from "../_lib/numbers";
import type { QuoteProduct } from "../_lib/queries";
import { ProductPicker } from "./product-picker";

type Kind = "servico" | "material";

export type QuoteFormInitial = {
  id?: string;
  customerId: string | null;
  contactName: string;
  contactPersonType: "pf" | "pj";
  contactDocument: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  zip: string | null;
  street: string | null;
  addressNumber: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  workType: string;
  title: string;
  description: string | null;
  discount: number;
  validUntil: string;
  terms: string | null;
  items: { kind: Kind; productId: string | null; description: string; quantity: number; unit: string; unitPrice: number }[];
};

type Draft = {
  key: string;
  kind: Kind;
  productId: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

type ViaCep = { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean | string };

const PLACEHOLDER_TITLE: Record<string, string> = {
  corretiva: "Ex.: Conserto do split da sala, sem gelar",
  instalacao: "Ex.: Instalação de split 12.000 BTUs no quarto",
  visita_tecnica: "Ex.: Visita técnica para avaliar a climatização da loja",
  preventiva: "Ex.: Limpeza completa de 3 aparelhos split",
  pmoc: "Ex.: Elaboração do PMOC e manutenção mensal",
};

const docMask = (pt: "pf" | "pj") => (pt === "pj" ? "cnpj" : "cpf");

export function QuoteForm({
  initial,
  customers,
  products,
  today,
  validityDays,
  cancelHref,
}: {
  initial: QuoteFormInitial;
  customers: CustomerOption[];
  products: QuoteProduct[];
  today: string;
  validityDays: number;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState(saveQuote, initialActionState);
  useActionToast(state);
  const fe = state.fieldErrors ?? {};
  const editing = Boolean(initial.id);

  // cliente
  const [mode, setMode] = useState<"avulso" | "cliente">(initial.customerId ? "cliente" : "avulso");
  const [customerId, setCustomerId] = useState<string | null>(initial.customerId);
  const [loadingCustomer, startCustomer] = useTransition();
  const [name, setName] = useState(initial.contactName);
  const [personType, setPersonType] = useState<"pf" | "pj">(initial.contactPersonType);
  const [doc, setDoc] = useState(initial.contactDocument ? applyMask(docMask(initial.contactPersonType), initial.contactDocument) : "");
  const [phone, setPhone] = useState(initial.contactPhone ? applyMask("phone", initial.contactPhone) : "");
  const [email, setEmail] = useState(initial.contactEmail ?? "");

  // endereço
  const [zip, setZip] = useState(initial.zip ? applyMask("cep", initial.zip) : "");
  const [street, setStreet] = useState(initial.street ?? "");
  const [number, setNumber] = useState(initial.addressNumber ?? "");
  const [complement, setComplement] = useState(initial.complement ?? "");
  const [district, setDistrict] = useState(initial.district ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [uf, setUf] = useState(initial.state ?? "");
  const [lookup, setLookup] = useState<"idle" | "loading" | "found" | "missing" | "error">("idle");
  const lastCep = useRef<string | null>(initial.zip ?? null);
  const numberRef = useRef<HTMLInputElement>(null);
  const addressFromCustomer = useRef(false);

  // serviço
  const [workType, setWorkType] = useState(initial.workType);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");

  // itens e valores (chaves determinísticas: o HTML do servidor e o do navegador precisam bater)
  const nextKey = useRef(0);
  const newKey = () => `n${nextKey.current++}`;
  const [items, setItems] = useState<Draft[]>(() =>
    initial.items.length
      ? initial.items.map((i, idx) => ({
          key: `i${idx}`,
          kind: i.kind,
          productId: i.productId,
          description: i.description,
          quantity: qtyText(i.quantity),
          unit: i.unit,
          unitPrice: moneyText(i.unitPrice),
        }))
      : [{ key: "i0", kind: "servico", productId: null, description: "", quantity: "1", unit: "serv", unitPrice: "" }],
  );
  const [discount, setDiscount] = useState(initial.discount ? moneyText(initial.discount) : "");
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [terms, setTerms] = useState(initial.terms ?? "");

  // erros dos itens: valem para a linha que estava naquela posição quando o servidor respondeu,
  // e somem do campo assim que ele é editado
  const [seenState, setSeenState] = useState(state);
  const [keysAtResult, setKeysAtResult] = useState<string[]>([]);
  const [edited, setEdited] = useState<Set<string>>(new Set());
  if (state !== seenState) {
    setSeenState(state);
    setKeysAtResult(items.map((i) => i.key));
    setEdited(new Set());
  }
  const itemError = (row: Draft, field: string) => {
    if (edited.has(`${row.key}.${field}`)) return undefined;
    const idx = keysAtResult.indexOf(row.key);
    return idx >= 0 ? fe[`items.${idx}.${field}`] : undefined;
  };

  const updateItem = (key: string, patch: Partial<Draft>) => {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setEdited((s) => {
      const next = new Set(s);
      for (const f of Object.keys(patch)) next.add(`${key}.${f}`);
      return next;
    });
  };
  const addItem = (kind: Kind) => {
    const key = newKey();
    setItems((rows) => [
      ...rows,
      { key, kind, productId: null, description: "", quantity: "1", unit: kind === "material" ? "un" : "serv", unitPrice: "" },
    ]);
  };
  const removeItem = (key: string) => setItems((rows) => rows.filter((r) => r.key !== key));

  const lines = items.map((i) => ({
    kind: i.kind,
    productId: i.kind === "material" ? i.productId : null,
    quantity: parseDecimal(i.quantity),
    unitPrice: parseDecimal(i.unitPrice),
  }));
  const totals = quoteTotals(
    lines.map((l) => ({ ...l, quantity: Number.isNaN(l.quantity) ? 0 : l.quantity, unitPrice: Number.isNaN(l.unitPrice) ? 0 : l.unitPrice })),
    parseDecimal(discount) || 0,
  );
  const discountError = !discountFits(totals)
    ? totals.services
      ? `O desconto sai da mão de obra: no máximo ${formatBRL(totals.services)}.`
      : "Sem serviços no orçamento não há mão de obra para descontar."
    : undefined;
  const itemsJson = JSON.stringify(
    items.map((i, idx) => ({
      kind: i.kind,
      productId: i.kind === "material" ? i.productId : null,
      description: i.description.trim(),
      quantity: Number.isNaN(lines[idx].quantity) ? null : lines[idx].quantity,
      unit: i.unit,
      unitPrice: Number.isNaN(lines[idx].unitPrice) ? null : lines[idx].unitPrice,
    })),
  );

  async function findCep(raw: string) {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8 || cep === lastCep.current) return;
    lastCep.current = cep;
    setLookup("loading");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = (await res.json()) as ViaCep;
      if (!res.ok || data.erro) {
        setLookup("missing");
        return;
      }
      if (data.logradouro) setStreet(data.logradouro);
      if (data.bairro) setDistrict(data.bairro);
      if (data.localidade) setCity(data.localidade);
      if (data.uf) setUf(data.uf);
      setLookup("found");
      if (data.logradouro) numberRef.current?.focus();
    } catch {
      setLookup("error");
    }
  }

  const fillAddress = (a: { zip: string | null; street: string | null; number: string | null; complement: string | null; district: string | null; city: string | null; state: string | null } | null) => {
    setZip(a?.zip ? applyMask("cep", a.zip) : "");
    lastCep.current = a?.zip ?? null;
    setStreet(a?.street ?? "");
    setNumber(a?.number ?? "");
    setComplement(a?.complement ?? "");
    setDistrict(a?.district ?? "");
    setCity(a?.city ?? "");
    setUf(a?.state ?? "");
    setLookup("idle");
  };

  const chooseCustomer = (id: string) => {
    if (id === customerId) return;
    setCustomerId(id);
    startCustomer(async () => {
      const c = await quoteCustomerAction(id);
      if (!c) return;
      setName(c.name);
      setPersonType(c.personType);
      setDoc(c.document ? applyMask(docMask(c.personType), c.document) : "");
      setPhone(c.phone ? applyMask("phone", c.phone) : "");
      setEmail(c.email ?? "");
      if (c.address) {
        fillAddress(c.address);
        addressFromCustomer.current = true;
      } else if (addressFromCustomer.current) {
        fillAddress(null);
        addressFromCustomer.current = false;
      }
    });
  };

  const customer = customers.find((c) => c.id === customerId);
  const services = items.filter((i) => i.kind === "servico").length;
  const materials = items.length - services;

  return (
    <ActionForm
      action={action}
      pending={pending}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="customerId" value={mode === "cliente" ? (customerId ?? "") : ""} />
      <input type="hidden" name="items" value={itemsJson} />

      <div className="min-w-0 space-y-6">
        <Panel
          title="Para quem"
          description={
            mode === "cliente"
              ? "Os dados de contato vão no orçamento; ajuste se for outra pessoa do cliente."
              : "Não precisa de cadastro: se a pessoa aprovar, o cliente é cadastrado com estes dados."
          }
        >
          <div className="space-y-5">
            <Segmented
              name="customerMode"
              legend="Cliente"
              value={mode}
              onChange={(v) => setMode(v as "avulso" | "cliente")}
              options={[
                { value: "avulso", label: "Pessoa sem cadastro" },
                { value: "cliente", label: "Cliente cadastrado" },
              ]}
            />
            {mode === "cliente" && (
              <Field
                label="Cliente"
                htmlFor="customer"
                error={fe.customerId}
                hint={customerId ? "Os dados de contato e o endereço principal vêm do cadastro; ajuste se precisar." : "Escolha o cliente ou volte para Pessoa sem cadastro."}
              >
                <div className="relative">
                  <CustomerPicker
                    id="customer"
                    customers={customers}
                    value={customerId}
                    onChange={chooseCustomer}
                    invalid={!!fe.customerId}
                    emptyText="Nenhum cliente encontrado. Use Pessoa sem cadastro."
                  />
                  {loadingCustomer && <Loader2 className="absolute right-9 top-1/2 size-4 -translate-y-1/2 animate-spin text-steel" />}
                </div>
              </Field>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              <Field label="Nome" htmlFor="contactName" required error={fe.contactName} className="sm:col-span-4">
                <Input
                  id="contactName"
                  name="contactName"
                  className="h-9"
                  value={name}
                  maxLength={200}
                  autoComplete="off"
                  placeholder="Nome da pessoa ou da empresa"
                  aria-invalid={!!fe.contactName || undefined}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Segmented
                name="contactPersonType"
                legend="Tipo"
                className="sm:col-span-2"
                value={personType}
                onChange={(v) => {
                  const pt = v === "pj" ? "pj" : "pf";
                  setPersonType(pt);
                  setDoc((d) => applyMask(docMask(pt), d));
                }}
                options={[
                  { value: "pf", label: "Pessoa" },
                  { value: "pj", label: "Empresa" },
                ]}
              />
              <Field label="WhatsApp ou telefone" htmlFor="contactPhone" error={fe.contactPhone} hint="Para enviar o orçamento pelo WhatsApp." className="sm:col-span-2">
                <Input
                  id="contactPhone"
                  name="contactPhone"
                  className="h-9 tabular-nums"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="(00) 00000-0000"
                  value={phone}
                  aria-invalid={!!fe.contactPhone || undefined}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPhone((prev) => applyMask("phone", raw, prev));
                  }}
                />
              </Field>
              <Field label="E-mail" htmlFor="contactEmail" error={fe.contactEmail} className="sm:col-span-2">
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  className="h-9"
                  autoComplete="off"
                  value={email}
                  aria-invalid={!!fe.contactEmail || undefined}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field
                label={personType === "pj" ? "CNPJ" : "CPF"}
                htmlFor="contactDocument"
                error={fe.contactDocument}
                hint="Opcional. Evita cadastro duplicado na aprovação."
                className="sm:col-span-2"
              >
                <Input
                  id="contactDocument"
                  name="contactDocument"
                  className="h-9 tabular-nums"
                  inputMode={personType === "pf" ? "numeric" : undefined}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={personType === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
                  value={doc}
                  aria-invalid={!!fe.contactDocument || undefined}
                  onChange={(e) => setDoc(applyMask(docMask(personType), e.target.value))}
                />
              </Field>
            </div>
          </div>
        </Panel>

        <Panel title="Local do serviço" description="Opcional. Na aprovação vira o local de atendimento do cliente.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field label="CEP" htmlFor="zip" error={fe.zip} className="sm:col-span-2 lg:col-span-3">
              <div className="relative">
                <Input
                  id="zip"
                  name="zip"
                  className="h-9 pr-9 tabular-nums"
                  inputMode="numeric"
                  placeholder="00000-000"
                  autoComplete="off"
                  value={zip}
                  aria-invalid={!!fe.zip || undefined}
                  onChange={(e) => {
                    const v = applyMask("cep", e.target.value);
                    setZip(v);
                    void findCep(v);
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center">
                  {lookup === "loading" ? (
                    <Loader2 className="size-4 animate-spin text-steel" />
                  ) : lookup === "found" ? (
                    <CircleCheck className="size-4 text-mint" />
                  ) : (
                    <MapPin className="size-4 text-steel/70" />
                  )}
                </span>
              </div>
              {(lookup === "missing" || lookup === "error") && (
                <p className="text-xs text-brass" aria-live="polite">
                  {lookup === "missing" ? "CEP não encontrado. Preencha à mão." : "Não deu para consultar o CEP agora."}
                </p>
              )}
            </Field>
            <Field label="Logradouro" htmlFor="street" error={fe.street} className="sm:col-span-4 lg:col-span-7">
              <Input id="street" name="street" className="h-9" placeholder="Rua, avenida…" value={street} onChange={(e) => setStreet(e.target.value)} />
            </Field>
            <Field label="Número" htmlFor="addressNumber" error={fe.addressNumber} className="sm:col-span-2 lg:col-span-2">
              <Input id="addressNumber" ref={numberRef} name="addressNumber" className="h-9" value={number} onChange={(e) => setNumber(e.target.value)} />
            </Field>
            <Field label="Complemento" htmlFor="complement" error={fe.complement} className="sm:col-span-4 lg:col-span-3">
              <Input id="complement" name="complement" className="h-9" placeholder="Apto, bloco, sala" value={complement} onChange={(e) => setComplement(e.target.value)} />
            </Field>
            <Field label="Bairro" htmlFor="district" error={fe.district} className="sm:col-span-2 lg:col-span-4">
              <Input id="district" name="district" className="h-9" value={district} onChange={(e) => setDistrict(e.target.value)} />
            </Field>
            <Field label="Cidade" htmlFor="city" error={fe.city} className="sm:col-span-3 lg:col-span-4">
              <Input id="city" name="city" className="h-9" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="UF" htmlFor="state" error={fe.state} className="sm:col-span-1 lg:col-span-1">
              <Input
                id="state"
                name="state"
                className="h-9 uppercase"
                maxLength={2}
                placeholder="SP"
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Serviço" description="O título e a descrição aparecem no orçamento e passam para a OM.">
          <div className="space-y-4">
            <Segmented
              name="workType"
              legend="Tipo de serviço"
              value={workType}
              onChange={setWorkType}
              options={WORK_ORDER_TYPES.map((t) => ({ ...t, tone: labelOf(workOrderType, t.value).tone }))}
            />
            <Field label="Título" htmlFor="title" required error={fe.title}>
              <Input
                id="title"
                name="title"
                className="h-9"
                maxLength={160}
                value={title}
                placeholder={PLACEHOLDER_TITLE[workType] ?? ""}
                aria-invalid={!!fe.title || undefined}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Descrição" htmlFor="description" error={fe.description}>
              <Textarea
                id="description"
                name="description"
                rows={3}
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="O que foi visto na visita, o que será feito e o que o cliente precisa providenciar."
              />
            </Field>
          </div>
        </Panel>

        <Panel
          flush
          title="Itens"
          description="Serviços entram como mão de obra. Materiais do estoque são lançados na OM pelo preço orçado e saem do estoque na aprovação."
        >
          {fe.items && <p className="border-b border-rime px-5 py-2.5 text-sm text-gauge-red">{fe.items}</p>}
          <ul className="divide-y divide-rime">
            {items.map((row, idx) => {
              const qty = parseDecimal(row.quantity);
              const price = parseDecimal(row.unitPrice);
              const total = Number.isNaN(qty) || Number.isNaN(price) ? null : Math.round(qty * price * 100) / 100;
              const product = row.productId ? products.find((p) => p.id === row.productId) : undefined;
              const unitOptions = QUOTE_UNITS.includes(row.unit as (typeof QUOTE_UNITS)[number]) ? QUOTE_UNITS : [row.unit, ...QUOTE_UNITS];
              const errDesc = itemError(row, "description") ?? itemError(row, "productId");
              const errNumbers = itemError(row, "quantity") ?? itemError(row, "unit") ?? itemError(row, "unitPrice");
              const kindLabel = row.kind === "material" ? "Material do estoque" : "Serviço";
              return (
                <li key={row.key} className="px-4 py-3.5 sm:px-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-2.5 text-steel" title={kindLabel}>
                      {row.kind === "material" ? <Package className="size-4" aria-hidden /> : <Wrench className="size-4" aria-hidden />}
                      <span className="sr-only">{kindLabel}</span>
                    </span>
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div>
                        {row.kind === "material" ? (
                          <ProductPicker
                            id={`item-${row.key}-desc`}
                            products={products}
                            value={row.productId}
                            label={row.description}
                            invalid={!!errDesc}
                            onChange={(p) =>
                              updateItem(row.key, {
                                productId: p.id,
                                description: p.name,
                                unit: p.unit,
                                ...(p.salePrice > 0 ? { unitPrice: moneyText(p.salePrice) } : {}),
                              })
                            }
                          />
                        ) : (
                          <Input
                            id={`item-${row.key}-desc`}
                            aria-label={`Descrição do item ${idx + 1}`}
                            className="h-9"
                            maxLength={300}
                            placeholder="Ex.: Instalação do split com até 3 m de tubulação"
                            value={row.description}
                            aria-invalid={!!errDesc || undefined}
                            onChange={(e) => updateItem(row.key, { description: e.target.value })}
                          />
                        )}
                        {errDesc && <p className="mt-1 text-xs text-gauge-red">{errDesc}</p>}
                        {row.kind === "material" && product && !errDesc && product.salePrice <= 0 && !row.unitPrice && (
                          <p className="mt-1 text-xs text-brass">Produto sem preço de venda: informe o valor.</p>
                        )}
                      </div>
                      <div className="grid grid-cols-[4.5rem_5rem_minmax(0,1fr)] items-end gap-2 sm:flex sm:gap-3">
                        <div className="sm:w-[5.5rem]">
                          <label htmlFor={`item-${row.key}-qty`} className="mb-1 block text-xs text-steel">
                            Qtd.
                          </label>
                          <Input
                            id={`item-${row.key}-qty`}
                            className="h-9 text-right tabular-nums"
                            inputMode="decimal"
                            value={row.quantity}
                            aria-invalid={!!itemError(row, "quantity") || undefined}
                            onChange={(e) => updateItem(row.key, { quantity: sanitizeQty(e.target.value) })}
                          />
                        </div>
                        <div className="sm:w-24">
                          <label htmlFor={`item-${row.key}-unit`} className="mb-1 block text-xs text-steel">
                            Unid.
                          </label>
                          {row.kind === "material" ? (
                            <div id={`item-${row.key}-unit`} className="flex h-9 items-center px-1 text-sm text-steel">
                              {row.unit}
                            </div>
                          ) : (
                            <SelectField
                              id={`item-${row.key}-unit`}
                              className={nativeSelectClass}
                              value={row.unit}
                              onChange={(e) => updateItem(row.key, { unit: e.target.value })}
                            >
                              {unitOptions.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </SelectField>
                          )}
                        </div>
                        <div className="sm:w-32">
                          <label htmlFor={`item-${row.key}-price`} className="mb-1 block text-xs text-steel">
                            Valor unit. (R$)
                          </label>
                          <Input
                            id={`item-${row.key}-price`}
                            className="h-9 text-right tabular-nums"
                            inputMode="numeric"
                            placeholder="0,00"
                            value={row.unitPrice}
                            aria-invalid={!!itemError(row, "unitPrice") || undefined}
                            onChange={(e) => updateItem(row.key, { unitPrice: applyMask("money", e.target.value) })}
                          />
                        </div>
                        <div className="col-span-3 flex items-baseline justify-between border-t border-dashed border-rime pt-2 sm:ml-auto sm:block sm:border-0 sm:pt-0 sm:text-right">
                          <span className="text-xs text-steel sm:mb-1 sm:block">Total do item</span>
                          <span className={cn("text-sm font-medium tabular-nums sm:flex sm:h-9 sm:items-center sm:justify-end", total == null ? "text-steel" : "text-silver")}>
                            {total == null ? "—" : formatBRL(total)}
                          </span>
                        </div>
                      </div>
                      {errNumbers && <p className="text-xs text-gauge-red">{errNumbers}</p>}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 text-steel hover:text-gauge-red"
                      aria-label={`Remover item ${idx + 1}`}
                      disabled={items.length === 1}
                      onClick={() => removeItem(row.key)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2 border-t border-rime px-4 py-3 sm:px-5">
            <Button type="button" variant="outline" size="sm" onClick={() => addItem("servico")}>
              <Plus />
              Adicionar serviço
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addItem("material")} disabled={!products.length}>
              <Plus />
              Adicionar material do estoque
            </Button>
          </div>
          <div className="flex flex-col gap-4 border-t border-rime px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <Field label="Desconto (R$)" htmlFor="discount" error={discountError ?? fe.discount} hint="Sai da mão de obra." className="sm:w-44">
              <Input
                id="discount"
                name="discount"
                className="h-9 text-right tabular-nums"
                inputMode="numeric"
                placeholder="0,00"
                value={discount}
                aria-invalid={!!(discountError ?? fe.discount) || undefined}
                onChange={(e) => setDiscount(applyMask("money", e.target.value))}
              />
            </Field>
            <dl className="w-full space-y-1 text-sm sm:max-w-64">
              <div className="flex justify-between">
                <dt className="text-steel">Serviços</dt>
                <dd className="tabular-nums text-silver">{formatBRL(totals.services)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-steel">Materiais</dt>
                <dd className="tabular-nums text-silver">{formatBRL(totals.materials)}</dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-steel">Desconto</dt>
                  <dd className="tabular-nums text-silver">−{formatBRL(totals.discount)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-rime pt-1.5">
                <dt className="font-medium text-silver">Total</dt>
                <dd className="text-lg font-semibold tabular-nums text-silver">{formatBRL(totals.total)}</dd>
              </div>
            </dl>
          </div>
        </Panel>

        <Panel title="Validade e condições" description="As condições saem impressas no orçamento.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <Field label="Válido até" htmlFor="validUntil" required error={fe.validUntil} hint={`Padrão: ${validityDays} dias.`}>
              <DateField id="validUntil" name="validUntil" className="h-9" min={today} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </Field>
            <Field label="Condições" htmlFor="terms" error={fe.terms} hint="O texto padrão fica em Configurações, Orçamentos.">
              <Textarea id="terms" name="terms" rows={4} maxLength={4000} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </Field>
          </div>
        </Panel>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Panel title="Resumo" bodyClassName="space-y-4">
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3">
              <UserRound className="mt-0.5 size-4 shrink-0 text-steel" />
              <span className={cn("min-w-0", name.trim() ? "text-silver" : "text-steel")}>
                <span className="block truncate">{name.trim() || "Sem nome ainda"}</span>
                <span className="block text-xs text-steel">
                  {mode === "cliente" && customer
                    ? "Cliente cadastrado"
                    : mode === "cliente"
                      ? "Escolha o cliente"
                      : "Sem cadastro: é cadastrado se aprovar"}
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <ReceiptText className="mt-0.5 size-4 shrink-0 text-steel" />
              <span className="text-silver">
                {services} {services === 1 ? "serviço" : "serviços"}
                {materials ? `, ${materials} ${materials === 1 ? "material" : "materiais"}` : ""}
                <span className="block text-xs text-steel">Válido até {formatDate(validUntil)}</span>
              </span>
            </li>
          </ul>
          <div className="rounded-lg bg-night/50 p-3 ring-1 ring-rime">
            <p className="text-xs text-steel">Total do orçamento</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-silver">{formatBRL(totals.total)}</p>
            <p className="mt-1 text-xs text-steel">
              Aprovado, vira uma {omTypePhrase(workType)} cobrada neste valor.
            </p>
          </div>
          {state.error && !Object.keys(fe).length && <p className="text-sm text-gauge-red">{state.error}</p>}
          <div className="flex flex-col gap-2 border-t border-rime pt-4">
            <FormSubmit className="h-9 w-full" disabled={loadingCustomer || !!discountError || (mode === "cliente" && !customerId)}>
              {editing ? "Salvar alterações" : "Salvar orçamento"}
            </FormSubmit>
            <Button variant="ghost" asChild className="h-9 w-full text-steel">
              <Link href={cancelHref}>Voltar sem salvar</Link>
            </Button>
          </div>
        </Panel>
      </aside>
    </ActionForm>
  );
}
