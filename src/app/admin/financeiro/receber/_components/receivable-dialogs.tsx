"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { BankAccountOption } from "../../_lib/constants";
import { ConfirmPaymentDialog, type ConfirmTarget, type LateSettings } from "./confirm-payment-dialog";
import { ProofDialog, type ProofTarget } from "./proof-dialog";

type Target = ConfirmTarget & ProofTarget;
type Ctx = { openConfirm: (row: Target) => void; openProof: (row: Target) => void };

const DialogsContext = createContext<Ctx | null>(null);

/**
 * Mantém os diálogos de baixa e de comprovante fora das linhas da tabela:
 * quando a conta sai do filtro atual (ex.: deixa de estar vencida), o diálogo
 * continua aberto para mostrar a confirmação.
 */
export function ReceivableDialogsProvider({
  children,
  today,
  late,
  bankAccounts,
}: {
  children: React.ReactNode;
  today: string;
  late: LateSettings;
  bankAccounts: BankAccountOption[];
}) {
  const [row, setRow] = useState<Target | null>(null);
  const [kind, setKind] = useState<"confirm" | "proof" | null>(null);
  const value = useMemo<Ctx>(
    () => ({
      openConfirm: (r) => {
        setRow(r);
        setKind("confirm");
      },
      openProof: (r) => {
        setRow(r);
        setKind("proof");
      },
    }),
    [],
  );

  return (
    <DialogsContext.Provider value={value}>
      {children}
      {row && (
        <>
          <ConfirmPaymentDialog
            open={kind === "confirm"}
            onOpenChange={(v) => setKind(v ? "confirm" : null)}
            target={row}
            today={today}
            late={late}
            bankAccounts={bankAccounts}
          />
          <ProofDialog
            open={kind === "proof"}
            onOpenChange={(v) => setKind(v ? "proof" : null)}
            target={row}
            onConfirm={() => setKind("confirm")}
          />
        </>
      )}
    </DialogsContext.Provider>
  );
}

export function useReceivableDialogs() {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error("useReceivableDialogs precisa de ReceivableDialogsProvider");
  return ctx;
}
