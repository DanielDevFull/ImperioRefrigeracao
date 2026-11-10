"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Check, Copy, CopyPlus, Loader2, MessageCircle, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { DateField, SelectField, TimeField } from "@/components/system/fields";
import { ActionForm, Field, FormSubmit, nativeSelectClass } from "@/components/system/form";
import { toneOnTint } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState, type ActionState } from "@/lib/action";
import { endSentence, formatBRL, formatCustomerCode, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DialogActions, FormDialog } from "../../estoque/_components/form-dialog";
import { CustomerPicker, type CustomerOption } from "../../oms/nova/_components/customer-picker";
import { approveQuoteAction, duplicateQuote, markQuoteSent, rejectQuoteAction } from "../actions";
import { omTypePhrase } from "../_lib/defaults";

type ButtonProps = Pick<React.ComponentProps<typeof Button>, "variant" | "size" | "className">;

/**
 * Ação de decisão (aprovar/recusar) com o aviso disparado na própria ação: a página volta já atualizada
 * e o diálogo desmonta junto, então um aviso por efeito (useActionToast) não chegaria a aparecer.
 */
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

/** Abre o WhatsApp com a mensagem pronta e marca o orçamento como enviado. */
export function SendWhatsappButton({
  quoteId,
  href,
  children = "Enviar pelo WhatsApp",
  ...props
}: { quoteId: string; href: string; children?: React.ReactNode } & ButtonProps) {
  const router = useRouter();
  return (
    <Button asChild {...props}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={() => {
          void markQuoteSent(quoteId).then(() => router.refresh());
        }}
      >
        <MessageCircle />
        {children}
      </a>
    </Button>
  );
}

/** Copia o link público (para mandar por e-mail ou outro aplicativo) e marca como enviado. */
export function CopyLinkButton({ quoteId, url, ...props }: { quoteId: string; url: string } & ButtonProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      {...props}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          toast.success("Link copiado. Cole na conversa com o cliente.");
          setTimeout(() => setCopied(false), 2000);
          void markQuoteSent(quoteId).then(() => router.refresh());
        } catch {
          toast.error("Não deu para copiar. Selecione o link e copie à mão.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copiado" : "Copiar link"}
    </Button>
  );
}

/** Novo rascunho com os mesmos itens e contato (para outro cliente ou para refazer valores). */
export function DuplicateQuoteButton({ quoteId, ...props }: { quoteId: string } & ButtonProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      {...props}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await duplicateQuote(quoteId);
          if (r.ok && r.id) router.push(`/admin/orcamentos/${r.id}/editar?copia=1`);
          else toast.error(r.error ?? "Não foi possível duplicar.");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <CopyPlus />}
      Duplicar
    </Button>
  );
}

type Match = { id: string; code: number; name: string; reason: "documento" | "telefone" | "e-mail" };

/** Aprovação registrada pela equipe: escolhe o cliente (quando ainda não tem cadastro) e, se quiser, já agenda. */
export function ApproveQuoteDialog({
  quote,
  match,
  customers,
  technicians,
  today,
  trigger,
}: {
  quote: {
    id: string;
    contactName: string;
    total: number;
    workType: string;
    materials: number;
    customer: { code: number; name: string } | null;
    expiredOn: string | null;
  };
  match: Match | null;
  customers: CustomerOption[];
  technicians: { id: string; name: string }[];
  today: string;
  trigger: React.ReactNode;
}) {
  return (
    <FormDialog
      title="Aprovar e gerar OM"
      description={`O cliente aprovou por telefone, mensagem ou pessoalmente. A ${omTypePhrase(quote.workType)} nasce cobrada em ${formatBRL(quote.total)}.`}
      trigger={trigger}
    >
      {(close) => <ApproveForm quote={quote} match={match} customers={customers} technicians={technicians} today={today} onDone={close} />}
    </FormDialog>
  );
}

function ApproveForm({
  quote,
  match,
  customers,
  technicians,
  today,
  onDone,
}: {
  quote: React.ComponentProps<typeof ApproveQuoteDialog>["quote"];
  match: Match | null;
  customers: CustomerOption[];
  technicians: { id: string; name: string }[];
  today: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useDecision(approveQuoteAction.bind(null, quote.id), onDone);
  const fe = state.fieldErrors ?? {};
  const [choice, setChoice] = useState<"match" | "new" | "pick">(match ? "match" : "new");
  const [picked, setPicked] = useState<string | null>(null);
  const [technicianId, setTechnicianId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const customerValue = quote.customer
    ? ""
    : choice === "match" && match
      ? `existing:${match.id}`
      : choice === "pick" && picked
        ? `existing:${picked}`
        : "new";
  const missingPick = !quote.customer && choice === "pick" && !picked;
  const reason = { documento: "CPF/CNPJ", telefone: "telefone", "e-mail": "e-mail" } as const;

  return (
    <ActionForm action={action} pending={pending} className="space-y-5">
      <input type="hidden" name="customer" value={customerValue} />
      {quote.expiredOn && (
        <p className={cn("rounded-lg bg-brass/10 px-3 py-2 text-sm ring-1 ring-brass/30 light:bg-notice-brass", toneOnTint.brass)}>
          Venceu em {formatDate(quote.expiredOn)}. Pelo link o cliente não consegue mais aprovar, mas a equipe ainda pode registrar a aprovação.
        </p>
      )}

      {quote.customer ? (
        <p className="text-sm text-steel">
          Cliente: <span className="text-silver">{quote.customer.name}</span> ({formatCustomerCode(quote.customer.code)})
        </p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-silver">Cliente</legend>
          {match && (
            <ChoiceRow checked={choice === "match"} onSelect={() => setChoice("match")} title={`Usar o cadastro de ${match.name}`}>
              {formatCustomerCode(match.code)}, mesmo {reason[match.reason]} do orçamento.
            </ChoiceRow>
          )}
          <ChoiceRow checked={choice === "new"} onSelect={() => setChoice("new")} title="Cadastrar cliente novo">
            {endSentence(`Com o nome, o contato e o endereço de ${quote.contactName}`)}
          </ChoiceRow>
          <ChoiceRow checked={choice === "pick"} onSelect={() => setChoice("pick")} title="Escolher outro cliente">
            Quando quem aprovou já é cliente com outros dados.
          </ChoiceRow>
          {choice === "pick" && (
            <div className="pl-7">
              <CustomerPicker customers={customers} value={picked} onChange={setPicked} emptyText="Nenhum cliente encontrado." />
            </div>
          )}
        </fieldset>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_9.5rem_7rem]">
        <Field label="Técnico" htmlFor="ap-tech" error={fe.technicianId}>
          <SelectField id="ap-tech" name="technicianId" className={nativeSelectClass} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
            <option value="">Definir depois</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Data" htmlFor="ap-date" error={fe.scheduledDate}>
          <DateField id="ap-date" name="scheduledDate" className="h-9" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Horário" htmlFor="ap-time" error={fe.scheduledTime}>
          <TimeField id="ap-time" name="scheduledTime" className="h-9" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-steel">
        {technicianId && date
          ? "A OM já nasce agendada e o técnico é avisado."
          : "Sem técnico e data, a OM vai para a fila de despacho."}
        {quote.materials ? ` ${quote.materials} ${quote.materials === 1 ? "material sai" : "materiais saem"} do estoque.` : ""}
      </p>
      {state.error && !Object.keys(fe).length && <p className="text-sm text-gauge-red">{state.error}</p>}
      <DialogActions>
        <FormSubmit disabled={missingPick}>Aprovar e gerar OM</FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}

function ChoiceRow({ checked, onSelect, title, children }: { checked: boolean; onSelect: () => void; title: string; children: React.ReactNode }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 ring-1 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-frost",
        checked ? "bg-ice/10 ring-ice/35" : "ring-rime hover:ring-ice/25",
      )}
    >
      <input type="radio" name="customerChoice" checked={checked} onChange={onSelect} className="mt-1 accent-[var(--ice)]" />
      <span className="min-w-0">
        <span className="block text-sm text-silver">{title}</span>
        <span className="block text-xs text-steel">{children}</span>
      </span>
    </label>
  );
}

const REASONS = ["Achou caro", "Fechou com outra empresa", "Desistiu do serviço", "Não respondeu"];

/** Recusa registrada pela equipe, com o motivo para entender o que não fecha. */
export function RejectQuoteDialog({ quoteId, ...props }: { quoteId: string } & ButtonProps) {
  return (
    <FormDialog
      title="Registrar recusa"
      description="O orçamento sai da lista em aberto. Dá para reabrir depois se o cliente mudar de ideia."
      trigger={
        <Button type="button" {...props}>
          <ThumbsDown />
          Registrar recusa
        </Button>
      }
    >
      {(close) => <RejectForm quoteId={quoteId} onDone={close} />}
    </FormDialog>
  );
}

function RejectForm({ quoteId, onDone }: { quoteId: string; onDone: () => void }) {
  const [state, action, pending] = useDecision(rejectQuoteAction.bind(null, quoteId), onDone);
  const [reason, setReason] = useState("");
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      <Field label="Motivo" htmlFor="rj-reason" hint="Opcional.">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn(
                "rounded-full px-3 py-1 text-xs ring-1 transition-colors",
                reason === r ? "bg-ice/12 text-silver ring-ice/35" : "text-steel ring-rime hover:text-silver",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea id="rj-reason" name="reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {state.error && <p className="text-sm text-gauge-red">{state.error}</p>}
      <DialogActions>
        <FormSubmit className="bg-gauge-red text-abyss hover:bg-gauge-red/90">Registrar recusa</FormSubmit>
      </DialogActions>
    </ActionForm>
  );
}
