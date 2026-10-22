"use client";

import { useActionState, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Landmark, Pencil, Plus, Settings2, Tags } from "lucide-react";
import { toast } from "sonner";
import { Field, useActionToast } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initialActionState, type ActionState } from "@/lib/action";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createBankAccount,
  createCategory,
  setBankAccountActive,
  setCategoryActive,
  updateBankAccount,
  updateCategory,
} from "../actions";
import { CATEGORY_SWATCHES } from "../_lib/constants";
import { ActionForm, FormSubmit } from "./action-form";

export type SetupCategory = { id: string; name: string; type: "receita" | "despesa"; color: string; active: boolean };
export type SetupAccount = {
  id: string;
  name: string;
  initialBalance: number;
  active: boolean;
  received: number;
  paid: number;
  balance: number;
};

export function SetupSheet({
  categories,
  accounts,
  unassigned,
}: {
  categories: SetupCategory[];
  accounts: SetupAccount[];
  unassigned: number;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Settings2 />
          Categorias e contas
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 overflow-y-auto border-rime bg-night p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b border-rime px-5 py-5">
          <SheetTitle className="font-display text-silver-brushed text-xl font-semibold">Categorias e contas</SheetTitle>
          <SheetDescription>
            Categorias classificam receitas e despesas no resultado do mês. Contas bancárias mostram onde está o dinheiro.
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="categorias" className="px-5 py-5">
          <TabsList className="w-full">
            <TabsTrigger value="categorias">
              <Tags />
              Categorias
            </TabsTrigger>
            <TabsTrigger value="contas">
              <Landmark />
              Contas bancárias
            </TabsTrigger>
          </TabsList>
          <TabsContent value="categorias" className="mt-4 space-y-6">
            <NewCategoryForm />
            <CategoryGroup title="Receitas" items={categories.filter((c) => c.type === "receita")} />
            <CategoryGroup title="Despesas" items={categories.filter((c) => c.type === "despesa")} />
          </TabsContent>
          <TabsContent value="contas" className="mt-4 space-y-6">
            <AccountList accounts={accounts} unassigned={unassigned} />
            <NewAccountForm />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/* --------------------------------- Cores --------------------------------- */

function SwatchPicker({ name, defaultValue, error }: { name: string; defaultValue?: string; error?: string }) {
  const [value, setValue] = useState(defaultValue ?? CATEGORY_SWATCHES[0].value);
  return (
    <div>
      <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-2">
        {CATEGORY_SWATCHES.map((s) => {
          const checked = s.value === value;
          return (
            <label
              key={s.value}
              title={s.label}
              className={cn(
                "grid size-7 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-night transition-shadow has-focus-visible:ring-2 has-focus-visible:ring-frost light:shadow-[inset_0_0_0_1px_var(--rime)]",
                checked && "ring-2 ring-silver/80",
              )}
              style={{ background: s.value }}
            >
              <input
                type="radio"
                name={name}
                value={s.value}
                checked={checked}
                onChange={() => setValue(s.value)}
                className="sr-only"
                aria-label={s.label}
              />
              {checked && <Check className="size-3.5 text-abyss light:text-silver" strokeWidth={3} />}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-gauge-red">{error}</p>}
    </div>
  );
}

/* ------------------------------- Categorias ------------------------------ */

function NewCategoryForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createCategory, initialActionState);
  const [formKey, setFormKey] = useState(0);
  useActionToast(state, {
    success: "Categoria criada",
    onSuccess: () => {
      setFormKey((k) => k + 1);
      setOpen(false);
    },
  });
  if (!open)
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Plus />
        Nova categoria
      </Button>
    );
  return (
    <ActionForm key={formKey} action={action} pending={pending} className="space-y-4 rounded-xl bg-glacier/40 p-4 ring-1 ring-rime">
      <Field label="Nome" htmlFor="cat-name" error={state.fieldErrors?.name} required>
        <Input id="cat-name" name="name" placeholder="Ex.: Manutenção de veículos" maxLength={60} autoFocus required />
      </Field>
      <Field label="Tipo" error={state.fieldErrors?.type} required>
        <div className="grid grid-cols-2 gap-2">
          {(["despesa", "receita"] as const).map((t) => (
            <label
              key={t}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-steel ring-1 ring-rime has-checked:bg-ice/10 has-checked:text-silver has-checked:ring-ice/40"
            >
              <input type="radio" name="type" value={t} defaultChecked={t === "despesa"} className="accent-ice" />
              {t === "despesa" ? "Despesa" : "Receita"}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Cor" error={undefined}>
        <SwatchPicker name="color" error={state.fieldErrors?.color} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Voltar
        </Button>
        <FormSubmit>Criar categoria</FormSubmit>
      </div>
    </ActionForm>
  );
}

function CategoryGroup({ title, items }: { title: string; items: SetupCategory[] }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-silver">{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-lg px-3 py-3 text-sm text-steel ring-1 ring-rime">Nenhuma categoria de {title.toLowerCase()}.</p>
      ) : (
        <ul className="divide-y divide-rime overflow-hidden rounded-xl ring-1 ring-rime">
          <AnimatePresence initial={false}>
            {items.map((c) => (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <CategoryRow category={c} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function CategoryRow({ category }: { category: SetupCategory }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateCategory, initialActionState);
  useActionToast(state, { success: "Categoria salva", onSuccess: () => setEditing(false) });

  if (editing)
    return (
      <ActionForm action={action} pending={pending} className="space-y-3 bg-glacier/40 px-3 py-3">
        <input type="hidden" name="id" value={category.id} />
        <Field label="Nome" htmlFor={`cat-${category.id}`} error={state.fieldErrors?.name} required>
          <Input id={`cat-${category.id}`} name="name" defaultValue={category.name} maxLength={60} autoFocus required />
        </Field>
        <SwatchPicker name="color" defaultValue={category.color} error={state.fieldErrors?.color} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Voltar
          </Button>
          <FormSubmit size="sm">Salvar categoria</FormSubmit>
        </div>
      </ActionForm>
    );

  return (
    <div className={cn("flex items-center gap-3 px-3 py-2.5", !category.active && "opacity-60")}>
      <span
        className="size-2.5 shrink-0 rounded-full light:ring-1 light:ring-rime light:shadow-[inset_0_0_0_1px_oklch(from_var(--c)_0.55_c_h)]"
        style={{ background: category.color, ["--c" as string]: category.color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-sm text-silver">{category.name}</span>
      {!category.active && <ToneBadge tone="steel">Inativa</ToneBadge>}
      <Button variant="ghost" size="icon-sm" className="text-steel" onClick={() => setEditing(true)} aria-label={`Editar ${category.name}`}>
        <Pencil />
      </Button>
      <ActiveSwitch
        active={category.active}
        label={category.name}
        onToggle={(v) => setCategoryActive(category.id, v)}
      />
    </div>
  );
}

function ActiveSwitch({ active, label, onToggle }: { active: boolean; label: string; onToggle: (v: boolean) => Promise<ActionState> }) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState(active);
  const [lastActive, setLastActive] = useState(active);
  if (lastActive !== active) {
    setLastActive(active);
    setOptimistic(active);
  }
  return (
    <Switch
      checked={optimistic}
      disabled={pending}
      aria-label={optimistic ? `Desativar ${label}` : `Ativar ${label}`}
      onCheckedChange={(v) => {
        setOptimistic(v);
        start(async () => {
          const r = await onToggle(v);
          if (r.ok === false || r.error) {
            setOptimistic(!v);
            toast.error(r.error ?? "Não foi possível alterar.");
          } else toast.success(r.message ?? "Salvo");
        });
      }}
    />
  );
}

/* ---------------------------- Contas bancárias --------------------------- */

function AccountList({ accounts, unassigned }: { accounts: SetupAccount[]; unassigned: number }) {
  if (accounts.length === 0)
    return <p className="rounded-lg px-3 py-3 text-sm text-steel ring-1 ring-rime">Nenhuma conta cadastrada. Crie a primeira abaixo.</p>;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-rime overflow-hidden rounded-xl ring-1 ring-rime">
        <AnimatePresence initial={false}>
          {accounts.map((a) => (
            <motion.li
              key={a.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <AccountRow account={a} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {Math.abs(unassigned) >= 0.01 && (
        <p className="px-1 text-xs text-steel">
          Movimentos sem conta definida somam {formatBRL(unassigned)} e entram só no saldo geral.
        </p>
      )}
    </div>
  );
}

function AccountRow({ account }: { account: SetupAccount }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateBankAccount, initialActionState);
  useActionToast(state, { success: "Conta salva", onSuccess: () => setEditing(false) });

  if (editing)
    return (
      <ActionForm action={action} pending={pending} className="space-y-3 bg-glacier/40 px-3 py-3">
        <input type="hidden" name="id" value={account.id} />
        <Field label="Nome" htmlFor={`acc-${account.id}`} error={state.fieldErrors?.name} required>
          <Input id={`acc-${account.id}`} name="name" defaultValue={account.name} maxLength={60} autoFocus required />
        </Field>
        <Field
          label="Saldo inicial"
          htmlFor={`acc-bal-${account.id}`}
          error={state.fieldErrors?.initialBalance}
          hint="Saldo da conta antes do primeiro lançamento no sistema."
        >
          <MaskedInput id={`acc-bal-${account.id}`} name="initialBalance" mask="money" defaultValue={account.initialBalance} className="tabular-nums" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Voltar
          </Button>
          <FormSubmit size="sm">Salvar conta</FormSubmit>
        </div>
      </ActionForm>
    );

  return (
    <div className={cn("px-3 py-3", !account.active && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-silver">{account.name}</p>
          <p className="mt-0.5 text-xs text-steel">Saldo inicial {formatBRL(account.initialBalance)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("readout text-base font-semibold", account.balance < 0 ? "text-gauge-red" : "text-silver")}>
            {formatBRL(account.balance)}
          </p>
          <p className="text-xs text-steel">saldo atual</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {account.active ? <span className="text-xs text-steel">Ativa</span> : <ToneBadge tone="steel">Inativa</ToneBadge>}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-steel" onClick={() => setEditing(true)}>
            <Pencil />
            Editar
          </Button>
          <ActiveSwitch active={account.active} label={account.name} onToggle={(v) => setBankAccountActive(account.id, v)} />
        </div>
      </div>
    </div>
  );
}

function NewAccountForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createBankAccount, initialActionState);
  const [formKey, setFormKey] = useState(0);
  useActionToast(state, {
    success: "Conta criada",
    onSuccess: () => {
      setFormKey((k) => k + 1);
      setOpen(false);
    },
  });
  if (!open)
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Plus />
        Nova conta bancária
      </Button>
    );
  return (
    <ActionForm key={formKey} action={action} pending={pending} className="space-y-4 rounded-xl bg-glacier/40 p-4 ring-1 ring-rime">
      <Field label="Nome" htmlFor="acc-name" error={state.fieldErrors?.name} required>
        <Input id="acc-name" name="name" placeholder="Ex.: Conta PJ — Banco do Brasil" maxLength={60} autoFocus required />
      </Field>
      <Field label="Saldo inicial" htmlFor="acc-initial" error={state.fieldErrors?.initialBalance} hint="Quanto havia na conta ao começar a usar o sistema.">
        <MaskedInput id="acc-initial" name="initialBalance" mask="money" placeholder="0,00" className="tabular-nums" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Voltar
        </Button>
        <FormSubmit>Criar conta</FormSubmit>
      </div>
    </ActionForm>
  );
}
