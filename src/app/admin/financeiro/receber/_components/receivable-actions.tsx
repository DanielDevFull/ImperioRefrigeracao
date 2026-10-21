"use client";

import { Ban, Copy, FileSearch, MessageCircle, MoreHorizontal, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/system/confirm-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBRL, formatDate, whatsappLink } from "@/lib/format";
import { buildPixPayload, txidFor } from "@/lib/pix";
import { lateCharges, round2 } from "@/server/core/billing";
import { cn } from "@/lib/utils";
import { greetingName } from "../../_lib/constants";
import { cancelReceivable } from "../actions";
import type { ConfirmTarget, LateSettings } from "./confirm-payment-dialog";
import type { ProofTarget } from "./proof-dialog";
import { useReceivableDialogs } from "./receivable-dialogs";

export type PixConfig = { key: string; merchantName: string; merchantCity: string } | null;

export type ReceivableActionRow = ConfirmTarget &
  ProofTarget & {
    pixTxid: string | null;
    customerWhatsapp: string | null;
    customerPhone: string | null;
  };

export function ReceivableActions({
  row,
  today,
  late,
  pix,
  companyName,
  compact = false,
}: {
  row: ReceivableActionRow;
  today: string;
  late: LateSettings;
  pix: PixConfig;
  companyName: string;
  compact?: boolean;
}) {
  const dialogs = useReceivableDialogs();
  const open = row.status === "aberto" || row.status === "em_analise";
  const reviewing = row.status === "em_analise";
  const phone = row.customerWhatsapp || row.customerPhone;

  const base = round2(row.amount - row.discount);
  const dueToday = lateCharges({
    amount: base,
    dueDate: row.dueDate,
    paidOn: today,
    finePercent: late.finePercent,
    interestMonthlyPercent: late.interestMonthlyPercent,
  });

  const pixPayload = () =>
    pix
      ? buildPixPayload({
          key: pix.key,
          merchantName: pix.merchantName,
          merchantCity: pix.merchantCity,
          amount: dueToday.total,
          txid: row.pixTxid ?? txidFor(row.id),
        })
      : null;

  async function copyPix() {
    const payload = pixPayload();
    if (!payload) {
      toast.error("Cadastre a chave Pix da empresa em Configurações para gerar o copia e cola.");
      return;
    }
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Pix copia e cola copiado", {
        description: `${formatBRL(dueToday.total)}${dueToday.daysLate > 0 ? " (com multa e juros de hoje)" : ""}`,
      });
    } catch {
      toast.error("Não foi possível copiar automaticamente. Use o botão de WhatsApp ou copie pelo portal do cliente.");
    }
  }

  function chargeOnWhatsapp() {
    const payload = pixPayload();
    const hello = greetingName(row.customerName);
    const lines = [
      `Olá${hello ? `, ${hello}` : ""}! Tudo bem? Aqui é da ${companyName}.`,
      dueToday.daysLate > 0
        ? `Notamos que a cobrança "${row.description}", com vencimento em ${formatDate(row.dueDate)}, ainda está em aberto. O valor atualizado para hoje é ${formatBRL(dueToday.total)} (original ${formatBRL(base)}, com multa e juros).`
        : `Passando para lembrar da cobrança "${row.description}", no valor de ${formatBRL(base)}, com vencimento em ${formatDate(row.dueDate)}.`,
      payload ? `Para pagar, use o Pix copia e cola abaixo:\n\n${payload}` : "",
      "Se o pagamento já foi feito, pode desconsiderar esta mensagem (e, se puder, envie o comprovante pelo portal). Obrigado!",
    ].filter(Boolean);
    const link = whatsappLink(phone, lines.join("\n\n"));
    if (!link) {
      toast.error("Este cliente não tem WhatsApp ou telefone cadastrado. Atualize o cadastro do cliente.");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }

  if (!open && !row.proofUrl) return null;

  return (
    <div className={cn("flex items-center justify-end gap-1", compact && "justify-start")}>
      {reviewing ? (
        <Button size="sm" variant="outline" className="border-brass/40 text-brass hover:text-brass" onClick={() => dialogs.openProof(row)}>
          <FileSearch />
          Ver comprovante
        </Button>
      ) : open ? (
        <Button size="sm" variant="outline" onClick={() => dialogs.openConfirm(row)}>
          <Wallet />
          Confirmar pagamento
        </Button>
      ) : null}

      {(open || row.proofUrl) && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Mais ações" className="text-steel">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {reviewing && (
              <DropdownMenuItem onSelect={() => dialogs.openConfirm(row)}>
                <Wallet />
                Confirmar pagamento
              </DropdownMenuItem>
            )}
            {row.proofUrl && !reviewing && (
              <DropdownMenuItem onSelect={() => dialogs.openProof(row)}>
                <FileSearch />
                Ver comprovante
              </DropdownMenuItem>
            )}
            {open && (
              <>
                {(reviewing || row.proofUrl) && <DropdownMenuSeparator />}
                <DropdownMenuItem onSelect={copyPix} disabled={!pix}>
                  <Copy />
                  Copiar Pix copia e cola
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={chargeOnWhatsapp} disabled={!phone}>
                  <MessageCircle />
                  Cobrar no WhatsApp
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {open && (
        <ConfirmAction
          action={cancelReceivable.bind(null, row.id)}
          title="Cancelar esta conta a receber?"
          description={`${row.description} (${formatBRL(base)}) deixa de ser cobrada e sai do portal do cliente. Esta ação não pode ser desfeita.`}
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
    </div>
  );
}
