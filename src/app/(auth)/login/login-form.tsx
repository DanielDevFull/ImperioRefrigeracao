"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toneOnTint } from "@/components/system/tone-badge";
import { authClient } from "@/lib/auth/client";
import { safeInternalPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

export function LoginForm({ back, initialError }: { back?: string; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const { data, error } = await authClient.signIn.email({ email: email.trim(), password });
      if (error || !data) {
        const banned = error?.code === "BANNED_USER" || /banned/i.test(error?.message ?? "");
        setError(
          banned
            ? "Seu acesso está bloqueado. Fale com a Imperium."
            : error?.status === 401 || error?.code === "INVALID_EMAIL_OR_PASSWORD"
              ? "E-mail ou senha incorretos."
              : error?.status === 429
                ? "Muitas tentativas. Aguarde um minuto e tente de novo."
                : "Não foi possível entrar. Verifique sua conexão e tente novamente.",
        );
        return;
      }
      const role = (data.user as { role?: string }).role;
      const home = role === "admin" || role === "gestor" ? "/admin" : role === "tecnico" ? "/tecnico" : "/portal";
      router.replace(safeInternalPath(back) ?? home);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11"
          placeholder="voce@empresa.com.br"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-steel hover:text-frost"
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className={cn("rounded-lg border border-gauge-red/30 bg-gauge-red/10 px-3 py-2 text-sm", toneOnTint.red)}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <Button type="submit" size="lg" className="h-11 w-full text-[0.95rem]" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Entrar
      </Button>
      <p className="text-center text-xs text-steel">
        Esqueceu a senha? Peça uma nova à Imperium pelo WhatsApp.
      </p>
    </form>
  );
}
