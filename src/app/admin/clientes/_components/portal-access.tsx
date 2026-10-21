"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, MessageCircle, RefreshCw, ShieldOff, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/system/confirm-action";
import { Field, useActionToast } from "@/components/system/form";
import { DetailList } from "@/components/system/panel";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, whatsappLink } from "@/lib/format";
import { createPortalAccess, removePortalAccess, resetPortalPassword } from "../actions";
import { PendingButton, useFormSubmit } from "./form-submit";

type Access = { email: string; createdAt: string; lastSessionAt: string | null; banned: boolean };

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generatePassword(len = 10) {
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function PortalAccess({
  customerId,
  customerName,
  customerWhatsapp,
  suggestedEmail,
  access,
  appUrl,
  initialPassword,
}: {
  customerId: string;
  customerName: string;
  customerWhatsapp: string | null;
  suggestedEmail: string | null;
  access: Access | null;
  appUrl: string;
  /** Gerada no servidor para não divergir na hidratação */
  initialPassword: string;
}) {
  const [shared, setShared] = useState<{ email: string; password: string; kind: "novo" | "senha" } | null>(null);
  // O formulário de criação some assim que o acesso existe (a página é revalidada no mesmo passo),
  // por isso o estado dele fica aqui no pai, que continua montado.
  const [email, setEmail] = useState(suggestedEmail ?? "");
  const [password, setPassword] = useState(initialPassword);
  const create = useFormSubmit(createPortalAccess.bind(null, customerId));
  useActionToast(create.state, {
    onSuccess: () => setShared({ email: email.trim().toLowerCase(), password, kind: "novo" }),
  });

  return (
    <div className="space-y-5">
      <AnimatePresence>
        {shared && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-mint/30 bg-mint/8 p-4"
          >
            <CredentialsCard
              {...shared}
              customerName={customerName}
              customerWhatsapp={customerWhatsapp}
              appUrl={appUrl}
              onClose={() => setShared(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {access ? (
        <ExistingAccess
          customerId={customerId}
          access={access}
          appUrl={appUrl}
          onReset={(pwd) => setShared({ email: access.email, password: pwd, kind: "senha" })}
        />
      ) : (
        <CreateAccess
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          form={create}
        />
      )}
    </div>
  );
}

function PasswordInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const [show, setShow] = useState(true);
  return (
    <Field label="Senha temporária" htmlFor="portal-password" error={error} hint="Mínimo de 8 caracteres. O cliente pode trocar depois de entrar.">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="portal-password"
            name="password"
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="new-password"
            className="h-9 pr-10 font-mono tracking-wide"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-steel hover:text-frost"
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button type="button" variant="outline" className="h-9" onClick={() => onChange(generatePassword())}>
          <Sparkles />
          Gerar
        </Button>
      </div>
    </Field>
  );
}

function CreateAccess({
  email,
  setEmail,
  password,
  setPassword,
  form,
}: {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  form: ReturnType<typeof useFormSubmit>;
}) {
  const { state, onSubmit, pending } = form;
  const fe = state.fieldErrors ?? {};
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <div className="mb-3 grid size-11 place-items-center rounded-full bg-ice/10 ring-1 ring-ice/25">
          <KeyRound className="size-5 text-ice" />
        </div>
        <p className="font-medium text-silver">Este cliente ainda não acessa o portal</p>
        <p className="mt-1 max-w-md text-sm text-steel">
          No portal ele acompanha os equipamentos e as visitas, baixa o PMOC, vê as mensalidades com Pix e abre chamados.
          Crie o acesso com uma senha temporária e envie pelo WhatsApp.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="E-mail de acesso" htmlFor="portal-email" error={fe.email} required>
          <Input
            id="portal-email"
            name="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contato@cliente.com.br"
            className="h-9"
          />
        </Field>
        <PasswordInput value={password} onChange={setPassword} error={fe.password} />
        {state.error && !state.ok && (
          <p role="alert" className="text-sm text-gauge-red">
            {state.error}
          </p>
        )}
        <PendingButton pending={pending}>
          <KeyRound />
          Criar acesso ao portal
        </PendingButton>
      </form>
    </div>
  );
}

function ExistingAccess({
  customerId,
  access,
  appUrl,
  onReset,
}: {
  customerId: string;
  access: Access;
  appUrl: string;
  onReset: (password: string) => void;
}) {
  const [resetting, setResetting] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-full bg-ice/10 ring-1 ring-ice/25">
            <KeyRound className="size-5 text-ice" />
          </div>
          <div>
            <p className="font-medium text-silver">{access.email}</p>
            <div className="mt-1">
              {access.banned ? <ToneBadge tone="red">Bloqueado</ToneBadge> : <ToneBadge tone="mint">Acesso ativo</ToneBadge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" onClick={() => setResetting((r) => !r)} aria-expanded={resetting}>
            <RefreshCw />
            Redefinir senha
          </Button>
          <ConfirmAction
            action={removePortalAccess.bind(null, customerId)}
            title="Remover o acesso ao portal?"
            description="O login deste cliente será apagado e as sessões abertas serão encerradas. Os dados do cliente continuam no sistema; você pode criar um novo acesso depois."
            confirmLabel="Remover acesso"
            success="Acesso ao portal removido"
            destructive
            variant="ghost"
            size="lg"
            className="text-gauge-red hover:text-gauge-red"
          >
            <ShieldOff />
            Remover acesso
          </ConfirmAction>
        </div>
      </div>
      <DetailList
        columns={3}
        items={[
          { label: "Criado em", value: formatDateTime(access.createdAt) },
          { label: "Último acesso", value: access.lastSessionAt ? formatDateTime(access.lastSessionAt) : "Ainda não entrou" },
          { label: "Endereço do portal", value: `${appUrl}/login` },
        ]}
      />
      <AnimatePresence initial={false}>
        {resetting && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <ResetForm
              customerId={customerId}
              onDone={(pwd) => {
                setResetting(false);
                onReset(pwd);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResetForm({ customerId, onDone }: { customerId: string; onDone: (password: string) => void }) {
  const [password, setPassword] = useState(() => generatePassword());
  const { state, onSubmit, pending } = useFormSubmit(resetPortalPassword.bind(null, customerId));
  useActionToast(state, { onSuccess: () => onDone(password) });
  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4 rounded-xl border border-rime bg-night/50 p-4" noValidate>
      <PasswordInput value={password} onChange={setPassword} error={state.fieldErrors?.password} />
      <p className="text-xs text-steel">As sessões abertas do cliente serão encerradas.</p>
      {state.error && !state.ok && (
        <p role="alert" className="text-sm text-gauge-red">
          {state.error}
        </p>
      )}
      <PendingButton pending={pending}>Salvar nova senha</PendingButton>
    </form>
  );
}

function CredentialsCard({
  email,
  password,
  kind,
  customerName,
  customerWhatsapp,
  appUrl,
  onClose,
}: {
  email: string;
  password: string;
  kind: "novo" | "senha";
  customerName: string;
  customerWhatsapp: string | null;
  appUrl: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const message =
    `Olá, ${customerName}! ${kind === "novo" ? "Seu acesso ao portal da Imperium Tec Refrigeração está pronto" : "Sua senha do portal da Imperium Tec Refrigeração foi redefinida"}.\n\n` +
    `Endereço: ${appUrl}/login\nE-mail: ${email}\nSenha: ${password}\n\n` +
    "No portal você acompanha seus equipamentos, visitas, mensalidades e pode abrir chamados.";
  const wa = whatsappLink(customerWhatsapp, message);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-mint">{kind === "novo" ? "Acesso criado" : "Senha redefinida"}</p>
          <p className="text-sm text-steel">Envie os dados ao cliente. A senha não aparece de novo depois que você sair desta tela.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      </div>
      <dl className="grid gap-2 rounded-lg bg-abyss/60 p-3 font-mono text-sm sm:grid-cols-2">
        <div>
          <dt className="font-sans text-xs text-steel">E-mail</dt>
          <dd className="truncate text-silver">{email}</dd>
        </div>
        <div>
          <dt className="font-sans text-xs text-steel">Senha</dt>
          <dd className="text-silver">{password}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {wa && (
          <Button asChild size="lg">
            <a href={wa} target="_blank" rel="noreferrer">
              <MessageCircle />
              Enviar pelo WhatsApp
            </a>
          </Button>
        )}
        <Button
          variant="outline"
          size="lg"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message);
              setCopied(true);
              toast.success("Mensagem copiada");
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          Copiar mensagem
        </Button>
      </div>
    </div>
  );
}
