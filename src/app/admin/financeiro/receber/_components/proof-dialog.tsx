"use client";

import { useActionState, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Field, useActionToast } from "@/components/system/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { formatBRL, formatDateTime } from "@/lib/format";
import { labelOf, paymentMethod } from "@/lib/labels";
import { rejectProofAction } from "../actions";
import { ActionForm, FormSubmit } from "../../_components/action-form";

export type ProofTarget = {
  id: string;
  description: string;
  customerName: string | null;
  amount: number;
  status: string;
  proofUrl: string | null;
  proofSentAt: Date | string | null;
  paymentMethod: string | null;
};

const isImage = (url: string) => /\.(png|jpe?g|webp|gif|avif|heic)(\?.*)?$/i.test(url);

export function ProofDialog({
  open,
  onOpenChange,
  target,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: ProofTarget;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        {open && <ProofBody target={target} onConfirm={onConfirm} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ProofBody({ target, onConfirm, onDone }: { target: ProofTarget; onConfirm: () => void; onDone: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [state, action, pending] = useActionState(rejectProofAction, initialActionState);
  useActionToast(state, { success: "Comprovante recusado", onSuccess: onDone });
  const reviewing = target.status === "em_analise";
  const url = target.proofUrl;

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-silver">Comprovante do cliente</DialogTitle>
        <DialogDescription>
          {target.customerName ? <span className="text-silver">{target.customerName}</span> : null}
          {target.customerName ? <br /> : null}
          {target.description}: {formatBRL(target.amount)}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-steel">
        <span>Enviado em {formatDateTime(target.proofSentAt)}</span>
        {target.paymentMethod && <span>Forma informada: {labelOf(paymentMethod, target.paymentMethod).label}</span>}
      </div>

      {url ? (
        isImage(url) ? (
          <a href={url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl bg-abyss ring-1 ring-rime">
            {/* eslint-disable-next-line @next/next/no-img-element -- arquivo enviado pelo cliente, tamanho desconhecido */}
            <img src={url} alt="Comprovante enviado pelo cliente" className="mx-auto max-h-[55dvh] w-auto object-contain" />
            <span className="flex items-center justify-center gap-1.5 border-t border-rime py-2 text-xs text-steel group-hover:text-frost">
              <ExternalLink className="size-3.5" />
              Abrir em tamanho real
            </span>
          </a>
        ) : (
          <div className="overflow-hidden rounded-xl ring-1 ring-rime">
            <object data={url} type="application/pdf" className="hidden h-[50dvh] w-full sm:block" aria-label="Comprovante em PDF">
              <span className="sr-only">Pré-visualização indisponível</span>
            </object>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 border-t border-rime bg-night/60 px-4 py-3 text-sm text-frost hover:bg-ice/10"
            >
              <FileText className="size-4" />
              Abrir comprovante em PDF
            </a>
          </div>
        )
      ) : (
        <p className="rounded-xl bg-night/60 p-4 text-sm text-steel ring-1 ring-rime">Nenhum arquivo foi anexado a esta conta.</p>
      )}

      {reviewing && rejecting && (
        <ActionForm action={action} pending={pending} className="grid gap-3 rounded-xl bg-gauge-red/5 p-4 ring-1 ring-gauge-red/25">
          <input type="hidden" name="id" value={target.id} />
          <Field
            label="Motivo da recusa"
            htmlFor="reason"
            error={state.fieldErrors?.reason}
            hint="O cliente recebe este texto no portal e a conta volta a ficar em aberto."
            required
          >
            <Textarea
              id="reason"
              name="reason"
              rows={3}
              autoFocus
              placeholder="Ex.: o valor do comprovante é diferente da mensalidade. Envie o comprovante correto."
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
              Voltar
            </Button>
            <FormSubmit className="bg-gauge-red text-white hover:bg-gauge-red/90">Recusar comprovante</FormSubmit>
          </div>
        </ActionForm>
      )}

      {reviewing && !rejecting && (
        <DialogFooter className="-mx-4 -mb-4 border-rime bg-night/50">
          <Button type="button" variant="outline" onClick={() => setRejecting(true)}>
            Recusar
          </Button>
          <Button type="button" onClick={onConfirm}>
            Confirmar pagamento
          </Button>
        </DialogFooter>
      )}
    </div>
  );
}
