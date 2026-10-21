"use client";

import { Field, nativeSelectClass } from "@/components/system/form";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/action";
import { PAYMENT_METHODS, type BankAccountOption } from "../_lib/constants";

/** Data, forma e conta de um pagamento (baixa de conta a receber ou a pagar). */
export function PaymentFields({
  state,
  today,
  paidOn,
  onPaidOnChange,
  method,
  bankAccounts,
  dateLabel = "Data do pagamento",
}: {
  state: ActionState;
  today: string;
  paidOn: string;
  onPaidOnChange: (v: string) => void;
  method?: string | null;
  bankAccounts: BankAccountOption[];
  dateLabel?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={dateLabel} htmlFor="paidOn" error={state.fieldErrors?.paidOn} required>
        <Input
          id="paidOn"
          name="paidOn"
          type="date"
          max={today}
          value={paidOn}
          onChange={(e) => onPaidOnChange(e.target.value)}
          required
        />
      </Field>
      <Field label="Forma" htmlFor="method" error={state.fieldErrors?.method} required>
        <select id="method" name="method" defaultValue={method ?? "pix"} className={nativeSelectClass}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Conta bancária" htmlFor="bankAccountId" error={state.fieldErrors?.bankAccountId} className="sm:col-span-2">
        <select id="bankAccountId" name="bankAccountId" defaultValue={bankAccounts[0]?.id ?? ""} className={nativeSelectClass}>
          {bankAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          <option value="">Sem conta definida</option>
        </select>
      </Field>
    </div>
  );
}
