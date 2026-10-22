import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Emblem } from "@/components/brand/emblem";
import { SnowField } from "@/components/brand/snow-field";
import { getCurrentUser, homeForRole } from "@/lib/auth/session";
import { safeInternalPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const back = safeInternalPath(typeof params.voltar === "string" ? params.voltar : undefined);
  if (user) redirect(back ?? homeForRole(user.role));
  const error = params.erro === "sem-cadastro"
    ? "Seu acesso ainda não foi vinculado a um cadastro. Fale com a Imperium."
    : undefined;

  return (
    <main className="relative grid min-h-dvh overflow-hidden lg:grid-cols-[1.15fr_1fr]">
      {/* Lado da marca */}
      <section className="relative hidden overflow-hidden lg:block">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 60% at 50% 42%, rgb(22 119 214 / 0.35), transparent 70%), radial-gradient(40% 40% at 50% 45%, rgb(56 168 255 / 0.18), transparent 70%), linear-gradient(180deg, #050c1d, #030712)",
          }}
        />
        <SnowField density="blizzard" />
        <div className="relative flex h-full flex-col items-center justify-center px-12 text-center">
          <Emblem size={340} halo priority />
          <p className="font-display text-silver-brushed mt-10 text-4xl font-bold tracking-[0.08em]">
            Imperium
          </p>
          <p className="mt-2 text-sm tracking-[0.12em] text-ice">Tec Refrigeração</p>
          <p className="mt-8 max-w-sm text-balance text-sm leading-relaxed text-steel">
            Clientes, planos de manutenção, OMs, estoque e financeiro no mesmo lugar.
          </p>
        </div>
        <div aria-hidden className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-rime-strong to-transparent" />
      </section>

      {/* Formulário */}
      <section className="relative flex min-h-dvh items-center justify-center px-5 py-12">
        <div className="absolute inset-0 lg:hidden">
          <SnowField density="calm" />
        </div>
        <div className="relative w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Emblem size={120} halo priority />
            <p className="font-display text-silver-brushed mt-5 text-2xl font-bold tracking-[0.08em]">
              Imperium
            </p>
            <p className="mt-1 text-xs tracking-[0.12em] text-ice">Tec Refrigeração</p>
          </div>
          <h1 className="font-display text-silver-brushed text-2xl font-semibold">Entrar</h1>
          <p className="mt-1.5 text-sm text-steel">
            Use o e-mail e a senha que a Imperium cadastrou para você.
          </p>
          <LoginForm back={back} initialError={error} />
        </div>
      </section>
    </main>
  );
}
