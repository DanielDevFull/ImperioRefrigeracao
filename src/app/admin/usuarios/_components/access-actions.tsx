"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Ban,
  KeyRound,
  Loader2,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  ShieldMinus,
  Trash2,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/system/form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/action";
import { PendingButton, useFormAction } from "@/app/admin/configuracoes/_components/form-kit";
import {
  blockAccess,
  removeAccess,
  resetAccessPassword,
  revokeAccessSessions,
  setStaffRole,
  unblockAccess,
} from "../actions";
import { copyText, PasswordField } from "./password-field";

export type AccessRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  sessions: number;
  linked: "tecnico" | "cliente" | null;
};

type Dialogs = "password" | "block" | null;
type Confirm = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  run: () => Promise<ActionState>;
} | null;

/** Menu de ações de um acesso (somente administradores veem). */
export function AccessActions({ row, isSelf }: { row: AccessRow; isSelf: boolean }) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pending, start] = useTransition();
  const first = row.name.split(" ")[0];
  const isStaff = row.role === "admin" || row.role === "gestor";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações do acesso de ${row.name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="truncate text-xs font-normal text-steel">{row.email}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setDialog("password")}>
            <KeyRound />
            Redefinir senha
          </DropdownMenuItem>
          {isStaff && !isSelf && (
            <DropdownMenuItem
              onSelect={() =>
                setConfirm(
                  row.role === "admin"
                    ? {
                        title: `Tornar ${first} gestor?`,
                        description:
                          "O gestor continua operando todo o sistema, mas deixa de criar acessos, redefinir senhas e bloquear pessoas.",
                        confirmLabel: "Tornar gestor",
                        run: () => setStaffRole(row.id, "gestor"),
                      }
                    : {
                        title: `Tornar ${first} administrador?`,
                        description:
                          "O administrador também gerencia os acessos: cria logins, redefine senhas, troca perfis e bloqueia pessoas.",
                        confirmLabel: "Tornar administrador",
                        run: () => setStaffRole(row.id, "admin"),
                      },
                )
              }
            >
              {row.role === "admin" ? <ShieldMinus /> : <ShieldCheck />}
              {row.role === "admin" ? "Tornar gestor" : "Tornar administrador"}
            </DropdownMenuItem>
          )}
          {!isSelf && row.sessions > 0 && (
            <DropdownMenuItem
              onSelect={() =>
                setConfirm({
                  title: `Encerrar as sessões de ${first}?`,
                  description: `${row.sessions === 1 ? "1 aparelho conectado será desconectado" : `${row.sessions} aparelhos conectados serão desconectados`}. A pessoa poderá entrar de novo com a senha atual.`,
                  confirmLabel: "Encerrar sessões",
                  run: () => revokeAccessSessions(row.id),
                })
              }
            >
              <LogOut />
              Encerrar sessões ({row.sessions})
            </DropdownMenuItem>
          )}
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              {row.banned ? (
                <DropdownMenuItem
                  onSelect={() =>
                    setConfirm({
                      title: `Desbloquear o acesso de ${first}?`,
                      description: "A pessoa volta a entrar no sistema com a senha que já tinha.",
                      confirmLabel: "Desbloquear acesso",
                      run: () => unblockAccess(row.id),
                    })
                  }
                >
                  <Unlock />
                  Desbloquear acesso
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("block")}>
                  <Ban />
                  Bloquear acesso
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  setConfirm({
                    title: `Excluir o acesso de ${first}?`,
                    description:
                      row.linked === "tecnico"
                        ? "O login é apagado. O cadastro do técnico, as OMs e as comissões continuam; dá para criar um novo acesso pela ficha do técnico."
                        : row.linked === "cliente"
                          ? "O login é apagado. O cadastro do cliente, os equipamentos e o histórico continuam; dá para criar um novo acesso pela ficha do cliente."
                          : "O login é apagado e não pode ser recuperado. O histórico de OMs e lançamentos feitos por esta pessoa continua.",
                    confirmLabel: "Excluir acesso",
                    destructive: true,
                    run: () => removeAccess(row.id),
                  })
                }
              >
                <Trash2 />
                Excluir acesso
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "password"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {dialog === "password" && <PasswordForm row={row} onDone={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "block"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {dialog === "block" && <BlockForm row={row} onDone={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-sans text-base font-semibold text-silver">{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
            <Button
              variant={confirm?.destructive ? "destructive" : "default"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (!confirm) return;
                  const r = await confirm.run();
                  if (r.ok === false || r.error) toast.error(r.error ?? "Não foi possível concluir.");
                  else {
                    toast.success(r.message ?? "Feito");
                    setConfirm(null);
                  }
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {confirm?.confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function useResultToast(state: ActionState, onOk: () => void) {
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Feito");
      onOk();
    } else if (state.error) toast.error(state.error);
  }, [state, onOk]);
}

function PasswordForm({ row, onDone }: { row: AccessRow; onDone: () => void }) {
  const { state, onSubmit, pending } = useFormAction(resetAccessPassword.bind(null, row.id));
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const first = row.name.split(" ")[0];
  useResultToast(state, () => setSaved(password));

  if (saved) {
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle className="font-sans text-base font-semibold text-silver">Senha redefinida</DialogTitle>
          <DialogDescription>
            Envie a nova senha para {first}. As sessões abertas continuam até a pessoa sair ou você encerrá-las.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 rounded-lg bg-night/70 p-4 ring-1 ring-rime">
          <div>
            <dt className="text-xs text-steel">E-mail</dt>
            <dd className="text-sm text-silver">{row.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-steel">Nova senha</dt>
            <dd className="font-mono text-sm tracking-wide text-frost">{saved}</dd>
          </div>
        </dl>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => copyText(`E-mail: ${row.email}\nNova senha: ${saved}`, "Dados copiados")}
          >
            Copiar dados
          </Button>
          <Button onClick={onDone}>Concluir</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="font-sans text-base font-semibold text-silver">Redefinir senha de {first}</DialogTitle>
        <DialogDescription>A senha atual deixa de valer assim que você salvar a nova.</DialogDescription>
      </DialogHeader>
      <Field label="Nova senha" htmlFor={`pw-${row.id}`} error={state.fieldErrors?.password} hint="Pelo menos 8 caracteres." required>
        <PasswordField id={`pw-${row.id}`} value={password} onChange={setPassword} invalid={!!state.fieldErrors?.password} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <PendingButton pending={pending}>Salvar nova senha</PendingButton>
      </DialogFooter>
    </form>
  );
}

function BlockForm({ row, onDone }: { row: AccessRow; onDone: () => void }) {
  const { state, onSubmit, pending } = useFormAction(blockAccess.bind(null, row.id));
  const first = row.name.split(" ")[0];
  useResultToast(state, onDone);
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="font-sans text-base font-semibold text-silver">Bloquear o acesso de {first}?</DialogTitle>
        <DialogDescription>
          {first} é desconectado de todos os aparelhos e não consegue mais entrar até você desbloquear. Nenhum dado é apagado.
        </DialogDescription>
      </DialogHeader>
      <Field label="Motivo" htmlFor={`reason-${row.id}`} hint="Opcional. Fica registrado no acesso.">
        <Input id={`reason-${row.id}`} name="reason" maxLength={200} placeholder="Ex.: desligado da empresa" />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Voltar
        </Button>
        <PendingButton pending={pending} variant="destructive">
          Bloquear acesso
        </PendingButton>
      </DialogFooter>
    </form>
  );
}
