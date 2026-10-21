"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, nativeSelectClass, useActionToast } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { commissionBasis, workOrderType } from "@/lib/labels";
import { FormError, PendingButton, useFormAction } from "../../tecnicos/_components/form-kit";
import { saveRule } from "../actions";

export type RuleRow = {
  id: string;
  name: string;
  technicianId: string | null;
  workOrderType: string | null;
  basis: "percentual_mao_de_obra" | "percentual_total" | "percentual_materiais" | "fixo_por_om";
  rate: number;
  priority: number;
  active: boolean;
  usage: number;
};

export type TechOption = { id: string; name: string; color: string; active: boolean };

export function RuleDialog({
  rule,
  technicians,
  children,
}: {
  rule?: RuleRow;
  technicians: TechOption[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar regra de comissão" : "Nova regra de comissão"}</DialogTitle>
          <DialogDescription>
            Deixe técnico ou tipo em branco para valer para todos. Comissões já calculadas não mudam.
          </DialogDescription>
        </DialogHeader>
        {open && <RuleForm rule={rule} technicians={technicians} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RuleForm({ rule, technicians, onDone }: { rule?: RuleRow; technicians: TechOption[]; onDone: () => void }) {
  const action = useMemo(() => saveRule.bind(null, rule?.id ?? null), [rule?.id]);
  const { state, onSubmit, pending } = useFormAction(action);
  useActionToast(state, { onSuccess: onDone });
  const [basis, setBasis] = useState<RuleRow["basis"]>(rule?.basis ?? "percentual_mao_de_obra");
  const [active, setActive] = useState(rule?.active ?? true);
  const err = (k: string) => state.fieldErrors?.[k];
  const fixed = basis === "fixo_por_om";

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Nome da regra" htmlFor="rule-name" required error={err("name")}>
        <Input
          id="rule-name"
          name="name"
          defaultValue={rule?.name ?? ""}
          placeholder="Ex.: Corretivas — 12% do total"
          aria-invalid={Boolean(err("name")) || undefined}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Técnico" htmlFor="rule-tech" error={err("technicianId")}>
          <select id="rule-tech" name="technicianId" defaultValue={rule?.technicianId ?? ""} className={nativeSelectClass}>
            <option value="">Todos os técnicos</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.active ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo de OM" htmlFor="rule-type" error={err("workOrderType")}>
          <select id="rule-type" name="workOrderType" defaultValue={rule?.workOrderType ?? ""} className={nativeSelectClass}>
            <option value="">Todos os tipos</option>
            {Object.entries(workOrderType).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Base de cálculo" htmlFor="rule-basis" required error={err("basis")} hint={commissionBasis[basis]?.hint}>
        <select
          id="rule-basis"
          name="basis"
          value={basis}
          onChange={(e) => setBasis(e.target.value as RuleRow["basis"])}
          className={nativeSelectClass}
        >
          {Object.entries(commissionBasis).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={fixed ? "Valor por OM" : "Percentual"} htmlFor="rule-rate" required error={err("rate")}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-steel">
              {fixed ? "R$" : ""}
            </span>
            {fixed ? (
              <MaskedInput
                key="money"
                mask="money"
                id="rule-rate"
                name="rate"
                defaultValue={rule?.basis === "fixo_por_om" ? rule.rate : undefined}
                className="pl-9 text-right tabular-nums"
                placeholder="0,00"
                aria-invalid={Boolean(err("rate")) || undefined}
              />
            ) : (
              <Input
                key="pct"
                id="rule-rate"
                name="rate"
                inputMode="decimal"
                defaultValue={rule && rule.basis !== "fixo_por_om" ? String(rule.rate).replace(".", ",") : ""}
                className="pr-8 text-right tabular-nums"
                placeholder="8"
                aria-invalid={Boolean(err("rate")) || undefined}
              />
            )}
            {!fixed && (
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-steel">%</span>
            )}
          </div>
        </Field>
        <Field
          label="Prioridade"
          htmlFor="rule-priority"
          error={err("priority")}
          hint="Desempata regras igualmente específicas: a maior vence."
        >
          <Input
            id="rule-priority"
            name="priority"
            type="number"
            step={1}
            min={-100}
            max={100}
            defaultValue={rule?.priority ?? 0}
            className="tabular-nums"
          />
        </Field>
      </div>
      <label className="flex items-center gap-3 rounded-lg bg-night/50 px-3 py-2.5 text-sm ring-1 ring-rime">
        <Switch checked={active} onCheckedChange={setActive} aria-label="Regra ativa" />
        <span>
          <span className="block text-silver">{active ? "Regra ativa" : "Regra inativa"}</span>
          <span className="block text-xs text-steel">Regras inativas são ignoradas ao concluir OMs.</span>
        </span>
      </label>
      <input type="hidden" name="active" value={active ? "on" : ""} />
      <FormError state={state} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Voltar
        </Button>
        <PendingButton pending={pending}>{rule ? "Salvar regra" : "Criar regra"}</PendingButton>
      </DialogFooter>
    </form>
  );
}
