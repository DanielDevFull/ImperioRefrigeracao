"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Field, nativeSelectClass } from "@/components/system/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PendingButton, useFormAction } from "@/app/admin/configuracoes/_components/form-kit";
import { createStaffAccess } from "../actions";
import { copyText, PasswordField } from "./password-field";

type Created = { name: string; email: string; password: string; role: string };

export function NewAccessDialog() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" />
          Novo acesso da equipe
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <NewAccessForm
          key={formKey}
          onClose={() => {
            setOpen(false);
            setFormKey((k) => k + 1);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewAccessForm({ onClose }: { onClose: () => void }) {
  const { state, onSubmit, pending } = useFormAction(createStaffAccess);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("gestor");
  const [created, setCreated] = useState<Created | null>(null);
  const last = useRef(state);

  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- troca para o resumo após a resposta do servidor
      setCreated({ name, email: email.trim().toLowerCase(), password, role });
      toast.success(state.message ?? "Acesso criado");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, name, email, password, role]);

  const fe = state.fieldErrors ?? {};

  if (created) {
    const text = `Seu acesso ao sistema Imperium\nE-mail: ${created.email}\nSenha provisória: ${created.password}\nEntre em ${window.location.origin}/login`;
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4">
        <DialogHeader>
          <DialogTitle className="font-sans text-base font-semibold text-silver">Acesso criado</DialogTitle>
          <DialogDescription>
            Envie estes dados para {created.name.split(" ")[0]}. A senha é provisória: combine a troca no primeiro acesso.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 rounded-lg bg-night/70 p-4 ring-1 ring-rime">
          <div>
            <dt className="text-xs text-steel">E-mail</dt>
            <dd className="text-sm text-silver">{created.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-steel">Senha provisória</dt>
            <dd className="font-mono text-sm tracking-wide text-frost">{created.password}</dd>
          </div>
          <div>
            <dt className="text-xs text-steel">Perfil</dt>
            <dd className="text-sm text-silver">{created.role === "admin" ? "Administrador" : "Gestor"}</dd>
          </div>
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={() => copyText(text, "Dados de acesso copiados")}>
            <Copy className="size-4" />
            Copiar dados de acesso
          </Button>
          <Button onClick={onClose}>Concluir</Button>
        </DialogFooter>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="font-sans text-base font-semibold text-silver">Novo acesso da equipe</DialogTitle>
        <DialogDescription>
          Para administradores e gestores do escritório. Técnicos e clientes recebem acesso pela própria ficha.
        </DialogDescription>
      </DialogHeader>
      <Field label="Nome" htmlFor="na-name" error={fe.name} required>
        <Input
          id="na-name"
          name="name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!fe.name || undefined}
        />
      </Field>
      <Field label="E-mail" htmlFor="na-email" error={fe.email} required>
        <Input
          id="na-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!fe.email || undefined}
        />
      </Field>
      <Field label="Senha provisória" htmlFor="na-password" error={fe.password} hint="Pelo menos 8 caracteres." required>
        <PasswordField id="na-password" value={password} onChange={setPassword} invalid={!!fe.password} />
      </Field>
      <Field
        label="Perfil"
        htmlFor="na-role"
        error={fe.role}
        hint="O gestor opera o sistema todo; só o administrador gerencia acessos."
        required
      >
        <select id="na-role" name="role" value={role} onChange={(e) => setRole(e.target.value)} className={nativeSelectClass}>
          <option value="gestor">Gestor</option>
          <option value="admin">Administrador</option>
        </select>
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <PendingButton pending={pending}>Criar acesso</PendingButton>
      </DialogFooter>
    </form>
  );
}
