"use client";

import { useMemo, useState } from "react";
import { Ban, KeyRound, LockOpen, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmAction } from "@/components/system/confirm-action";
import { Field, useActionToast } from "@/components/system/form";
import { ToneBadge } from "@/components/system/tone-badge";
import { formatDateTime, formatRelative } from "@/lib/format";
import { createAppAccess, resetAppPassword, setAppAccessBlocked } from "../actions";
import { FormError, PendingButton, TempPasswordInput, generatePassword, useFormAction } from "./form-kit";

export function AppAccess({
  technicianId,
  name,
  hasUser,
  loginEmail,
  banned,
  lastLogin,
  defaultEmail,
}: {
  technicianId: string;
  name: string;
  hasUser: boolean;
  loginEmail: string | null;
  banned: boolean;
  lastLogin: string | null;
  defaultEmail: string | null;
}) {
  if (!hasUser) return <CreateAccess technicianId={technicianId} defaultEmail={defaultEmail} />;
  return (
    <div>
      <dl className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-steel">Login</dt>
          <dd className="min-w-0 truncate text-right text-silver">{loginEmail ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-steel">Situação</dt>
          <dd>
            {banned ? <ToneBadge tone="red">Bloqueado</ToneBadge> : <ToneBadge tone="mint">Liberado</ToneBadge>}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-steel">Último acesso</dt>
          {/* tempo relativo muda entre o servidor e o navegador ("há 27" → "há 28 minutos") */}
          <dd className="text-right text-silver" title={lastLogin ? formatDateTime(lastLogin) : undefined} suppressHydrationWarning>
            {lastLogin ? formatRelative(lastLogin) : "Ainda não entrou"}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <ResetPassword technicianId={technicianId} name={name} />
        {banned ? (
          <ConfirmAction
            action={setAppAccessBlocked.bind(null, technicianId, false)}
            title={`Desbloquear o acesso de ${name}?`}
            description="Ele volta a entrar no app com o mesmo e-mail e senha."
            confirmLabel="Desbloquear acesso"
          >
            <LockOpen />
            Desbloquear acesso
          </ConfirmAction>
        ) : (
          <ConfirmAction
            action={setAppAccessBlocked.bind(null, technicianId, true)}
            title={`Bloquear o acesso de ${name}?`}
            description="Ele é desconectado do app na hora e não consegue entrar até você desbloquear. As OMs e o histórico não mudam."
            confirmLabel="Bloquear acesso"
            destructive
            className="text-gauge-red hover:text-gauge-red"
          >
            <Ban />
            Bloquear acesso
          </ConfirmAction>
        )}
      </div>
    </div>
  );
}

function CreateAccess({ technicianId, defaultEmail }: { technicianId: string; defaultEmail: string | null }) {
  const action = useMemo(() => createAppAccess.bind(null, technicianId), [technicianId]);
  const { state, onSubmit, pending } = useFormAction(action);
  useActionToast(state);
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const err = (k: string) => state.fieldErrors?.[k];

  if (!open)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="flex items-start gap-2 text-sm text-steel">
          <Smartphone className="mt-0.5 size-4 shrink-0 text-frost/70" />
          Sem acesso ao app. Com o acesso ele vê a agenda, executa as OMs e acompanha os ganhos no celular.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setPwd(generatePassword());
            setOpen(true);
          }}
        >
          <KeyRound />
          Criar acesso ao app
        </Button>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="E-mail de login" htmlFor="acc-email" required error={err("accessEmail")}>
        <Input
          id="acc-email"
          name="accessEmail"
          type="email"
          inputMode="email"
          defaultValue={defaultEmail ?? ""}
          aria-invalid={Boolean(err("accessEmail")) || undefined}
        />
      </Field>
      <Field
        label="Senha temporária"
        htmlFor="acc-password"
        required
        error={err("accessPassword")}
        hint="Envie ao técnico pelo WhatsApp junto com o e-mail."
      >
        <TempPasswordInput id="acc-password" name="accessPassword" defaultValue={pwd} invalid={Boolean(err("accessPassword"))} />
      </Field>
      <FormError state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <PendingButton pending={pending}>Criar acesso</PendingButton>
      </div>
    </form>
  );
}

function ResetPassword({ technicianId, name }: { technicianId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState("");
  const action = useMemo(() => resetAppPassword.bind(null, technicianId), [technicianId]);
  const { state, onSubmit, pending } = useFormAction(action);
  useActionToast(state, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setSeed(generatePassword());
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound />
          Redefinir senha
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Redefinir senha de {name}</DialogTitle>
          <DialogDescription>
            A senha atual deixa de funcionar. Envie a nova senha ao técnico.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Nova senha" htmlFor="new-password" required error={state.fieldErrors?.newPassword}>
            <TempPasswordInput key={seed} id="new-password" name="newPassword" defaultValue={seed} />
          </Field>
          <FormError state={state} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <PendingButton pending={pending}>Redefinir senha</PendingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
