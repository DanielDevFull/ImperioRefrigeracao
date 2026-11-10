"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, Field, FormSubmit } from "@/components/system/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";
import { DialogActions, FormDialog } from "../../../admin/estoque/_components/form-dialog";
import { approvePublicQuote, quoteViewed, rejectPublicQuote } from "../actions";

/** Aviso disparado na própria ação: a página volta já com a decisão e os botões somem junto. */
function useDecision(fn: (prev: ActionState, fd: FormData) => Promise<ActionState>, onSuccess: () => void) {
  return useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await fn(prev, fd);
    if (r.ok) {
      toast.success(r.message ?? "Feito");
      onSuccess();
    } else if (r.error) toast.error(r.error);
    return r;
  }, initialActionState);
}

/** Registra a primeira abertura pelo navegador do cliente (robôs de pré-visualização não rodam JS). */
export function ViewTracker({ token }: { token: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void quoteViewed(token);
  }, [token]);
  return null;
}

type Props = {
  token: string;
  number: string;
  contactName: string;
  total: string;
  companyName: string;
  /** Prévia da equipe: mostra os botões, sem permitir decidir pelo cliente */
  preview?: boolean;
  /** hero: cartão do topo; inline: fim da página; bar: barra fixa do celular */
  variant?: "hero" | "inline" | "bar";
  className?: string;
};

const LAYOUT = {
  hero: { root: "flex flex-col gap-2.5 sm:flex-row", approve: "h-12 w-full text-[0.95rem] sm:flex-1", reject: "h-12 w-full sm:w-auto", short: false },
  inline: { root: "flex flex-col gap-2.5 sm:flex-row", approve: "h-10 w-full sm:flex-1", reject: "h-10 w-full sm:w-auto", short: false },
  bar: { root: "flex flex-row gap-2", approve: "h-11 flex-1", reject: "h-11 px-3", short: true },
} as const;

export function PublicQuoteActions({ token, number, contactName, total, companyName, preview, variant = "hero", className }: Props) {
  const l = LAYOUT[variant];
  return (
    <div className={cn(l.root, className)}>
      <FormDialog
        title={`Aprovar o orçamento ${number}`}
        description={`Total de ${total}. Ao aprovar, você concorda com os itens e as condições do orçamento. A ${companyName} entra em contato para combinar a data.`}
        trigger={
          <Button size="lg" className={l.approve} disabled={preview}>
            <Check />
            {l.short ? "Aprovar" : "Aprovar orçamento"}
          </Button>
        }
      >
        {(close) => <ApproveForm token={token} contactName={contactName} onDone={close} />}
      </FormDialog>
      <FormDialog
        title="Recusar o orçamento"
        description="Pode contar o motivo? Ajuda a gente a melhorar. Se mudar de ideia, é só chamar."
        trigger={
          <Button variant="outline" size="lg" className={l.reject} disabled={preview}>
            <X />
            Recusar
          </Button>
        }
      >
        {(close) => <RejectForm token={token} contactName={contactName} onDone={close} />}
      </FormDialog>
    </div>
  );
}

function ApproveForm({ token, contactName, onDone }: { token: string; contactName: string; onDone: () => void }) {
  const [state, action, pending] = useDecision(approvePublicQuote.bind(null, token), onDone);
  const fe = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <Field label="Seu nome" htmlFor="pq-name" error={fe.name} hint="Fica registrado junto com a data da aprovação.">
        <Input id="pq-name" name="name" className="h-10" defaultValue={contactName} maxLength={120} autoComplete="name" />
      </Field>
      {state.error && !fe.name && <p className="text-sm text-gauge-red">{state.error}</p>}
      <DialogActions>
        <FormSubmit className="h-10">
          <Check />
          Confirmar aprovação
        </FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}

const REASONS = ["Achei caro", "Fechei com outra empresa", "Não preciso mais", "Vou deixar para depois"];

function RejectForm({ token, contactName, onDone }: { token: string; contactName: string; onDone: () => void }) {
  const [state, action, pending] = useDecision(rejectPublicQuote.bind(null, token), onDone);
  const [reason, setReason] = useState("");
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <input type="hidden" name="name" value={contactName} />
      <Field label="Motivo" htmlFor="pq-reason" hint="Opcional.">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs ring-1 transition-colors",
                reason === r ? "bg-ice/12 text-silver ring-ice/35" : "text-steel ring-rime hover:text-silver",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea id="pq-reason" name="reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {state.error && <p className="text-sm text-gauge-red">{state.error}</p>}
      <DialogActions>
        <FormSubmit variant="outline" className="h-10">
          Recusar orçamento
        </FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}
