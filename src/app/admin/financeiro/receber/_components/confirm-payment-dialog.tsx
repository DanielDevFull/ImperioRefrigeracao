"use client";

import { useActionState, useRef, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { FrostBurst } from "@/components/brand/frost-burst";
import { Field, useActionToast } from "@/components/system/form";
import { MaskedInput } from "@/components/system/masked-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { initialActionState } from "@/lib/action";
import { formatBRL, formatDate } from "@/lib/format";
import { lateCharges, round2 } from "@/server/core/billing";
import { cn } from "@/lib/utils";
import { PaymentFields } from "../../_components/payment-fields";
import type { BankAccountOption } from "../../_lib/constants";
import { confirmReceivableAction } from "../actions";
import { ActionForm, FormSubmit } from "../../_components/action-form";

export type ConfirmTarget = {
  id: string;
  description: string;
  customerName: string | null;
  dueDate: string;
  amount: number;
  discount: number;
  status: string;
  paymentMethod: string | null;
  /** Data (YYYY-MM-DD) em que o cliente enviou o comprovante, se houver */
  proofDate: string | null;
};

export type LateSettings = { finePercent: number; interestMonthlyPercent: number };

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export function ConfirmPaymentDialog({
  open,
  onOpenChange,
  target,
  today,
  late,
  bankAccounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: ConfirmTarget;
  today: string;
  late: LateSettings;
  bankAccounts: BankAccountOption[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {open && <ConfirmForm target={target} today={today} late={late} bankAccounts={bankAccounts} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmForm({
  target,
  today,
  late,
  bankAccounts,
  onDone,
}: {
  target: ConfirmTarget;
  today: string;
  late: LateSettings;
  bankAccounts: BankAccountOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(confirmReceivableAction, initialActionState);
  const [paidOn, setPaidOn] = useState(target.proofDate && target.proofDate <= today ? target.proofDate : today);
  const [waive, setWaive] = useState(false);
  const [burst, setBurst] = useState(0);
  const [confirmedAmount, setConfirmedAmount] = useState<number | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const base = round2(target.amount - target.discount);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(paidOn) ? paidOn : today;
  const charges = lateCharges({
    amount: base,
    dueDate: target.dueDate,
    paidOn: validDate,
    finePercent: late.finePercent,
    interestMonthlyPercent: late.interestMonthlyPercent,
  });
  const fine = waive ? 0 : charges.fine;
  const interest = waive ? 0 : charges.interest;
  const total = waive ? base : charges.total;

  useActionToast(state, {
    success: "Pagamento confirmado",
    onSuccess: () => {
      const typed = amountRef.current?.value;
      const n = typed ? Number(typed.replace(/\./g, "").replace(",", ".")) : total;
      setConfirmedAmount(Number.isFinite(n) ? n : total);
      setBurst((k) => k + 1);
      setTimeout(onDone, 1300);
    },
  });

  if (confirmedAmount != null) {
    return (
      <div className="relative grid min-h-72 place-items-center overflow-hidden py-6 text-center">
        <FrostBurst burstKey={burst} size={280} />
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
          className="relative"
        >
          <CheckCircle2 className="mx-auto size-12 text-mint" />
          <DialogTitle className="mt-4 text-xl font-semibold text-silver">Pagamento confirmado</DialogTitle>
          <DialogDescription className="mt-1 text-steel">
            {formatBRL(confirmedAmount)} recebidos{target.customerName ? ` de ${target.customerName}` : ""}.
          </DialogDescription>
        </motion.div>
      </div>
    );
  }

  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      <input type="hidden" name="id" value={target.id} />
      <input type="hidden" name="waiveLateFees" value={waive ? "on" : ""} />
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-silver">Confirmar pagamento</DialogTitle>
        <DialogDescription>
          {target.customerName ? <span className="text-silver">{target.customerName}</span> : null}
          {target.customerName ? <br /> : null}
          {target.description}
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-xl bg-muted/70 p-4 ring-1 ring-rime">
        <dl className="space-y-2 text-sm">
          <Row label="Vencimento">
            <span className={cn(charges.daysLate > 0 && "text-gauge-red")}>{formatDate(target.dueDate)}</span>
          </Row>
          <Row label="Dias de atraso">
            <span className={cn(charges.daysLate > 0 ? "text-gauge-red" : "text-mint")}>
              {charges.daysLate > 0 ? `${charges.daysLate} ${charges.daysLate === 1 ? "dia" : "dias"}` : "Em dia"}
            </span>
          </Row>
          <Row label="Valor original">{formatBRL(target.amount)}</Row>
          {target.discount > 0 && <Row label="Desconto">− {formatBRL(target.discount)}</Row>}
          <Row label={`Multa (${pct(late.finePercent)})`} muted={waive || charges.daysLate === 0}>
            <span className={cn(waive && charges.fine > 0 && "line-through")}>{formatBRL(charges.fine)}</span>
          </Row>
          <Row label={`Juros (${pct(late.interestMonthlyPercent)} ao mês, pró-rata)`} muted={waive || charges.daysLate === 0}>
            <span className={cn(waive && charges.interest > 0 && "line-through")}>{formatBRL(charges.interest)}</span>
          </Row>
        </dl>
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-rime pt-3">
          <span className="text-sm text-steel">Total em {formatDate(validDate)}</span>
          <span className="readout text-2xl font-semibold text-silver">{formatBRL(total)}</span>
        </div>
      </div>

      {charges.daysLate > 0 && (
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl px-1">
          <span>
            <span className="block text-sm font-medium text-silver">Dispensar multa e juros</span>
            <span className="block text-xs text-steel">Recebe só o valor original ({formatBRL(base)}).</span>
          </span>
          <Switch checked={waive} onCheckedChange={setWaive} aria-label="Dispensar multa e juros" />
        </label>
      )}

      <PaymentFields
        state={state}
        today={today}
        paidOn={paidOn}
        onPaidOnChange={setPaidOn}
        method={target.paymentMethod}
        bankAccounts={bankAccounts}
      />

      <Field
        label="Valor recebido"
        htmlFor="paidAmount"
        error={state.fieldErrors?.paidAmount}
        hint={fine + interest > 0 ? "Já inclui multa e juros. Ajuste se o cliente pagou outro valor." : "Ajuste se o cliente pagou outro valor."}
        required
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-steel">R$</span>
          <MaskedInput
            key={total}
            ref={amountRef}
            id="paidAmount"
            name="paidAmount"
            mask="money"
            defaultValue={total}
            className="pl-9 tabular-nums"
            required
          />
        </div>
      </Field>

      {state.error && !state.fieldErrors && <p className="text-sm text-gauge-red">{state.error}</p>}

      <DialogFooter className="-mx-4 -mb-4 mt-1 border-rime bg-muted/50">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Voltar
          </Button>
        </DialogClose>
        <FormSubmit>Confirmar pagamento</FormSubmit>
      </DialogFooter>
    </ActionForm>
  );
}

function Row({ label, children, muted }: { label: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", muted && "opacity-60")}>
      <dt className="text-steel">{label}</dt>
      <dd className="text-right tabular-nums text-silver">{children}</dd>
    </div>
  );
}
