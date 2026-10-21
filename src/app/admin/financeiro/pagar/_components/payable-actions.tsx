"use client";

import { createContext, useActionState, useContext, useMemo, useState } from "react";
import { Ban, Paperclip, Wallet } from "lucide-react";
import { ConfirmAction } from "@/components/system/confirm-action";
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
import { initialActionState } from "@/lib/action";
import { formatBRL, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PaymentFields } from "../../_components/payment-fields";
import type { BankAccountOption } from "../../_lib/constants";
import { cancelPayable, payPayableAction } from "../actions";
import { ActionForm, FormSubmit } from "../../_components/action-form";

export type PayableActionRow = {
  id: string;
  description: string;
  supplierName: string | null;
  dueDate: string;
  amount: number;
  status: string;
  attachmentUrl: string | null;
  commissionPayoutId: string | null;
};

type PayCtx = { openPay: (row: PayableActionRow) => void };
const PayContext = createContext<PayCtx | null>(null);

/**
 * Mantém o diálogo de pagamento fora das linhas: quando a conta sai do filtro
 * (deixa de estar em aberto), o diálogo fecha sozinho depois da confirmação.
 */
export function PayDialogProvider({
  children,
  today,
  bankAccounts,
}: {
  children: React.ReactNode;
  today: string;
  bankAccounts: BankAccountOption[];
}) {
  const [row, setRow] = useState<PayableActionRow | null>(null);
  const [open, setOpen] = useState(false);
  const value = useMemo<PayCtx>(
    () => ({
      openPay: (r) => {
        setRow(r);
        setOpen(true);
      },
    }),
    [],
  );
  return (
    <PayContext.Provider value={value}>
      {children}
      {row && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
            {open && <PayForm row={row} today={today} bankAccounts={bankAccounts} onDone={() => setOpen(false)} />}
          </DialogContent>
        </Dialog>
      )}
    </PayContext.Provider>
  );
}

export function PayableActions({ row, compact = false }: { row: PayableActionRow; compact?: boolean }) {
  const ctx = useContext(PayContext);
  const isOpen = row.status === "aberto";

  return (
    <div className={cn("flex items-center justify-end gap-1", compact && "justify-start")}>
      {isOpen && ctx && (
        <Button size="sm" variant="outline" onClick={() => ctx.openPay(row)}>
          <Wallet />
          Pagar
        </Button>
      )}
      {row.attachmentUrl && (
        <Button asChild size="icon-sm" variant="ghost" className="text-steel">
          <a href={row.attachmentUrl} target="_blank" rel="noreferrer" aria-label="Abrir anexo" title="Abrir anexo">
            <Paperclip />
          </a>
        </Button>
      )}
      {isOpen && !row.commissionPayoutId && (
        <ConfirmAction
          action={cancelPayable.bind(null, row.id)}
          title="Cancelar esta conta a pagar?"
          description={`${row.description} (${formatBRL(row.amount)}) sai da previsão de pagamentos. Esta ação não pode ser desfeita.`}
          confirmLabel="Cancelar conta"
          success="Conta cancelada"
          variant="ghost"
          size="icon-sm"
          destructive
          className="text-steel hover:text-gauge-red"
        >
          <Ban />
          <span className="sr-only">Cancelar conta</span>
        </ConfirmAction>
      )}
      {isOpen && row.commissionPayoutId && !compact && <span className="size-7 shrink-0" aria-hidden />}
    </div>
  );
}

function PayForm({
  row,
  today,
  bankAccounts,
  onDone,
}: {
  row: PayableActionRow;
  today: string;
  bankAccounts: BankAccountOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(payPayableAction, initialActionState);
  const [paidOn, setPaidOn] = useState(today);
  useActionToast(state, { success: "Pagamento registrado", onSuccess: onDone });
  const overdue = row.dueDate < today;

  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      <input type="hidden" name="id" value={row.id} />
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-silver">Registrar pagamento</DialogTitle>
        <DialogDescription>
          {row.supplierName ? <span className="text-silver">{row.supplierName}</span> : null}
          {row.supplierName ? <br /> : null}
          {row.description}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-baseline justify-between gap-4 rounded-xl bg-night/70 p-4 ring-1 ring-rime">
        <div>
          <p className="text-xs text-steel">Vencimento</p>
          <p className={cn("text-sm tabular-nums", overdue ? "text-gauge-red" : "text-silver")}>{formatDate(row.dueDate)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-steel">Valor da conta</p>
          <p className="readout text-2xl font-semibold text-silver">{formatBRL(row.amount)}</p>
        </div>
      </div>

      {row.commissionPayoutId && (
        <p className="rounded-lg bg-ice/8 px-3 py-2 text-xs text-frost ring-1 ring-ice/20">
          Ao pagar, as comissões deste fechamento ficam como pagas e o técnico é avisado.
        </p>
      )}

      <PaymentFields state={state} today={today} paidOn={paidOn} onPaidOnChange={setPaidOn} bankAccounts={bankAccounts} />

      <Field
        label="Valor pago"
        htmlFor="paidAmount"
        error={state.fieldErrors?.paidAmount}
        hint="Ajuste se houve juros, desconto ou pagamento parcial."
        required
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-steel">R$</span>
          <MaskedInput id="paidAmount" name="paidAmount" mask="money" defaultValue={row.amount} className="pl-9 tabular-nums" required />
        </div>
      </Field>

      {state.error && !state.fieldErrors && <p className="text-sm text-gauge-red">{state.error}</p>}

      <DialogFooter className="-mx-4 -mb-4 border-rime bg-night/50">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Voltar
          </Button>
        </DialogClose>
        <FormSubmit>Registrar pagamento</FormSubmit>
      </DialogFooter>
    </ActionForm>
  );
}
