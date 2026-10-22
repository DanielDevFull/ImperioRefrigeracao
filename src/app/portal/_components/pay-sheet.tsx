"use client";

import { useActionState, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, FileUp, Hourglass, MessageCircle, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { FrostBurst } from "@/components/brand/frost-burst";
import { SubmitButton, useActionToast } from "@/components/system/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { initialActionState, type ActionState } from "@/lib/action";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { shrinkImage, setInputFiles } from "../_lib/compress";
import { formatFileSize, UPLOAD_LIMIT_BYTES } from "../_lib/copy";
import type { PayData } from "../_lib/pay";
import { submitProofAction } from "../mensalidades/actions";

const sheetClass = cn(
  "frost-edge gap-0 overflow-y-auto p-0 sm:max-w-md",
  "bg-[linear-gradient(180deg,rgb(21_42_82/0.97),rgb(8_16_34/0.98))] ring-1 ring-rime shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]",
  "max-h-[92dvh] max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl",
  "max-sm:pb-[env(safe-area-inset-bottom)]",
);

/**
 * Folha de pagamento por Pix: valor do dia (com multa/juros explicados), QR,
 * copia e cola e envio do comprovante. O QR chega pronto do servidor.
 */
export function PaySheet({
  data,
  qr,
  triggerLabel,
  triggerVariant = "default",
  triggerClassName,
}: {
  data: PayData;
  qr: React.ReactNode;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const inReview = data.status === "em_analise";
  const label = inReview ? "Ver envio" : (triggerLabel ?? "Pagar com Pix");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={inReview ? "outline" : triggerVariant} size="lg" className={cn("px-3.5", triggerClassName)}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={sheetClass}
        onOpenAutoFocus={(e) => {
          // Foca a folha (não o campo do código), para leitores de tela começarem pelo título
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <SheetBody data={data} qr={qr} />
      </DialogContent>
    </Dialog>
  );
}

function SheetBody({ data, qr }: { data: PayData; qr: React.ReactNode }) {
  // O estado da ação fica aqui (e não no formulário) porque, ao enviar, a página
  // é revalidada e o formulário sai da tela no mesmo instante.
  const [state, formAction] = useActionState(submitProofAction, initialActionState);
  useActionToast(state, { success: "Comprovante enviado" });
  const justSent = state.ok === true;
  const inReview = data.status === "em_analise" || justSent;
  const late = data.daysLate > 0;

  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(56_168_255/0.22),transparent)]" />
      <div className="relative px-5 pb-5 pt-6 sm:px-6">
        <span aria-hidden className="mx-auto mb-4 block h-1 w-10 rounded-full bg-steel/30 sm:hidden" />
        <DialogTitle className="font-display text-silver-brushed text-xl font-semibold tracking-[0.02em]">
          {inReview ? "Comprovante enviado" : "Pagar com Pix"}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-steel">
          {data.title}
          <span className="block text-xs text-steel/80">{data.description}</span>
        </DialogDescription>

        <div className="mt-5">
          <p className="text-xs text-steel">{inReview ? "Valor informado" : late ? "Valor para pagar hoje" : "Valor"}</p>
          <p className="readout mt-1 text-[2.4rem] font-semibold leading-none text-silver">{formatBRL(data.total)}</p>
          <p className={cn("mt-2 text-sm", late && !inReview ? "text-gauge-red" : "text-steel")}>
            {late
              ? `Venceu em ${formatDate(data.dueDate)}, há ${data.daysLate} dia${data.daysLate === 1 ? "" : "s"}`
              : `Vence em ${formatDate(data.dueDate)}`}
          </p>
        </div>

        {late && !inReview && (
          <div className="mt-4 rounded-xl border border-brass/25 bg-brass/8 p-3.5 text-sm">
            <dl className="space-y-1.5">
              <Row label="Valor da cobrança" value={formatBRL(data.base)} />
              <Row label={`Multa de ${fmtPct(data.finePercent)}`} value={formatBRL(data.fine)} />
              <Row label={`Juros de ${fmtPct(data.interestPercent)} ao mês (${data.daysLate} dias)`} value={formatBRL(data.interest)} />
              <div className="border-t border-brass/20 pt-1.5">
                <Row label="Total hoje" value={formatBRL(data.total)} strong />
              </div>
            </dl>
            <p className="mt-2.5 text-xs leading-relaxed text-steel">
              Depois do vencimento o contrato prevê uma multa única de {fmtPct(data.finePercent)} e juros de{" "}
              {fmtPct(data.interestPercent)} ao mês, contados por dia de atraso. Pagando hoje, o valor acima já está certo.
            </p>
          </div>
        )}
      </div>

      {inReview ? (
        <ReviewPanel data={data} justSent={justSent} />
      ) : data.pixCode ? (
        <>
          <PixBlock code={data.pixCode} qr={qr} merchant={data.merchantName} />
          <ProofUpload receivableId={data.id} state={state} formAction={formAction} />
        </>
      ) : (
        <div className="relative border-t border-rime px-5 py-6 sm:px-6">
          <p className="text-sm font-medium text-silver">Pagamento por Pix ainda não configurado — fale com a Imperium</p>
          <p className="mt-1 text-sm text-steel">
            A chave Pix da empresa ainda não foi cadastrada. Chame a equipe no WhatsApp para receber os dados de pagamento.
          </p>
          {data.whatsappHref && (
            <Button asChild size="lg" className="mt-4 w-full">
              <a href={data.whatsappHref} target="_blank" rel="noreferrer">
                <MessageCircle /> Falar no WhatsApp
              </a>
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("text-steel", strong && "font-medium text-silver")}>{label}</dt>
      <dd className={cn("readout tabular-nums text-silver", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}

function fmtPct(n: number) {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function PixBlock({ code, qr, merchant }: { code: string; qr: React.ReactNode; merchant: string }) {
  const [copied, setCopied] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      const el = fieldRef.current;
      if (el) {
        el.select();
        ok = document.execCommand("copy");
      }
    }
    if (ok) {
      setCopied(true);
      toast.success("Código Pix copiado");
      setTimeout(() => setCopied(false), 2400);
    } else {
      toast.error("Não foi possível copiar. Toque no código e copie manualmente.");
    }
  }

  return (
    <div className="relative flex flex-col border-t border-rime px-5 py-5 sm:px-6">
      {/* No celular o QR não tem como ser lido pelo próprio aparelho: o copia e cola vem primeiro */}
      <div className="order-2 mt-6 flex flex-col items-center sm:order-1 sm:mt-0">
        <div className="rounded-2xl bg-white p-2.5 shadow-[0_0_0_6px_rgb(56_168_255/0.08),0_20px_40px_-20px_rgb(56_168_255/0.45)] max-sm:[&>span]:size-40!">
          {qr}
        </div>
        <p className="mt-3 text-center text-xs text-steel">
          <span className="block sm:hidden">Ou leia o QR code em outro aparelho.</span>
          Recebedor: {merchant}
        </p>
      </div>

      <div className="order-1 sm:order-2 sm:mt-5">
        <label htmlFor="pix-code" className="block text-xs text-steel">
          Pix copia e cola
        </label>
        <div className="mt-1.5 flex items-stretch gap-2">
          <input
            id="pix-code"
            ref={fieldRef}
            readOnly
            value={code}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 truncate rounded-lg border border-input bg-abyss/50 px-3 font-mono text-xs text-frost outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <Button type="button" size="lg" onClick={copy} className="relative min-w-[8.5rem] overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={copied ? "ok" : "copy"}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="inline-flex items-center gap-1.5"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copiado" : "Copiar código Pix"}
              </motion.span>
            </AnimatePresence>
          </Button>
        </div>
      </div>

      <ol className="order-3 mt-5 space-y-2.5 text-sm text-steel">
        {[
          "Abra o app do seu banco e escolha Pix.",
          "Use Pix copia e cola com o código copiado, ou leia o QR code.",
          `Confira o valor e o recebedor (${merchant}) e confirme.`,
          "Depois, envie o comprovante aqui embaixo para darmos baixa mais rápido.",
        ].map((t, i) => (
          <li key={i} className="flex gap-3">
            <span className="readout grid size-6 shrink-0 place-items-center rounded-full bg-ice/12 text-xs font-semibold text-ice ring-1 ring-ice/25">
              {i + 1}
            </span>
            <span className="pt-0.5">{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ProofUpload({
  receivableId,
  state,
  formAction,
}: {
  receivableId: string;
  state: ActionState;
  formAction: (fd: FormData) => void;
}) {
  const [openForm, setOpenForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setLocalError(null);
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return setFile(null);
    if (!/^(image\/|application\/pdf$)/.test(picked.type)) {
      e.target.value = "";
      setFile(null);
      return setLocalError("Envie uma imagem (JPG ou PNG) ou um PDF do comprovante.");
    }
    const ready = await shrinkImage(picked);
    if (ready.size > UPLOAD_LIMIT_BYTES - 16 * 1024) {
      e.target.value = "";
      setFile(null);
      return setLocalError("O arquivo passa de 8 MB. Envie um print da tela ou um PDF menor.");
    }
    if (ready !== picked && inputRef.current) setInputFiles(inputRef.current, [ready]);
    setFile(ready);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setLocalError(null);
  }

  const error = localError ?? state.fieldErrors?.comprovante ?? (state.ok === false ? state.error : undefined);

  return (
    <div className="relative border-t border-rime px-5 py-5 sm:px-6">
      {!openForm ? (
        <Button type="button" variant="outline" size="lg" className="h-11 w-full" onClick={() => setOpenForm(true)}>
          <FileUp /> Já paguei — enviar comprovante
        </Button>
      ) : (
        <motion.form
          action={formAction}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <input type="hidden" name="receivableId" value={receivableId} />
          <p className="text-sm font-medium text-silver">Enviar comprovante</p>
          <p className="mt-0.5 text-xs text-steel">Print da tela ou PDF do banco, até 8 MB.</p>

          <label
            htmlFor={`proof-${receivableId}`}
            className={cn(
              "mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 transition-colors",
              file ? "border-ice/40 bg-ice/8" : "border-rime-strong hover:border-ice/40 hover:bg-ice/5",
              error && "border-gauge-red/50",
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ice/12 text-ice ring-1 ring-ice/25">
              <Paperclip className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-silver">{file ? file.name : "Escolher arquivo"}</span>
              <span className="block text-xs text-steel">{file ? formatFileSize(file.size) : "Toque para abrir a galeria ou os arquivos"}</span>
            </span>
            {file && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  clear();
                }}
                className="grid size-8 place-items-center rounded-full text-steel hover:bg-ice/10 hover:text-silver"
                aria-label="Remover arquivo"
              >
                <X className="size-4" />
              </button>
            )}
          </label>
          <input
            ref={inputRef}
            id={`proof-${receivableId}`}
            name="comprovante"
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={onPick}
          />
          {error && (
            <p role="alert" className="mt-2 text-xs text-gauge-red">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="ghost" size="lg" className="h-11" onClick={() => setOpenForm(false)}>
              Voltar
            </Button>
            <SubmitButton size="lg" className="h-11 flex-1" disabled={!file}>
              Enviar comprovante
            </SubmitButton>
          </div>
        </motion.form>
      )}
    </div>
  );
}

function ReviewPanel({ data, justSent }: { data: PayData; justSent: boolean }) {
  return (
    <div className="relative border-t border-rime px-5 py-7 text-center sm:px-6">
      <FrostBurst burstKey={justSent ? 1 : 0} size={260} />
      <motion.span
        initial={justSent ? { scale: 0.4, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 18 }}
        className="relative mx-auto grid size-14 place-items-center rounded-full bg-brass/12 text-brass ring-1 ring-brass/30"
      >
        {justSent ? <Check className="size-6" /> : <Hourglass className="size-6" />}
      </motion.span>
      <p className="relative mt-4 text-base font-medium text-silver">Comprovante em análise</p>
      <p className="relative mx-auto mt-1.5 max-w-xs text-sm text-steel">
        {data.proofSentAt && !justSent ? `Enviado em ${formatDateTime(data.proofSentAt)}. ` : "Recebemos o seu comprovante. "}
        A Imperium confere o pagamento e confirma por aqui, normalmente no mesmo dia útil.
      </p>
      {data.proofUrl && (
        <Button asChild variant="link" className="relative mt-2">
          <a href={data.proofUrl} target="_blank" rel="noreferrer">
            Ver comprovante enviado
          </a>
        </Button>
      )}
    </div>
  );
}
