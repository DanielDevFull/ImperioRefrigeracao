import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { ArrowUpRight, Ban, CircleCheck, Clock, MessageCircle, ThumbsDown } from "lucide-react";
import { Emblem } from "@/components/brand/emblem";
import { SnowField } from "@/components/brand/snow-field";
import { toneOnTint } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { quotes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { formatBRL, formatDate, formatDocument, formatPhone, formatQuote, whatsappLink } from "@/lib/format";
import { cn } from "@/lib/utils";
import { daysToExpire, effectiveQuoteStatus } from "@/server/core/quotes";
import { getSettings } from "@/server/settings";
import { QuoteDocument } from "../../admin/orcamentos/_components/quote-document";
import { PublicQuoteActions, ViewTracker } from "./_components/public-actions";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** O token do link é a credencial: só ele abre o orçamento, sem login. */
const loadQuote = cache(async (token: string) => {
  if (!TOKEN_RE.test(token)) return null;
  const q = await db.query.quotes.findFirst({
    where: eq(quotes.publicToken, token),
    with: { items: { orderBy: (i, { asc }) => [asc(i.position)] } },
  });
  return q ?? null;
});

export async function generateMetadata({ params }: PageProps<"/orcamento/[token]">): Promise<Metadata> {
  const { token } = await params;
  const [q, settings] = await Promise.all([loadQuote(token), getSettings()]);
  if (!q) return { title: "Orçamento não encontrado", robots: { index: false, follow: false } };
  const title = `Orçamento ${formatQuote(q.number)} · ${settings.companyName}`;
  const description = `${q.title}. Total de ${formatBRL(q.total)}, válido até ${formatDate(q.validUntil)}.`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, siteName: settings.companyName, type: "website" },
  };
}

export default async function PublicQuotePage({ params }: PageProps<"/orcamento/[token]">) {
  const { token } = await params;
  const q = await loadQuote(token);
  if (!q) notFound();
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser()]);

  const today = todayISO();
  const status = effectiveQuoteStatus(q.status, q.validUntil, today);
  const staff = user?.role === "admin" || user?.role === "gestor";
  const canDecide = status === "rascunho" || status === "enviado";
  const number = formatQuote(q.number);
  const total = formatBRL(q.total);
  const first = q.contactName.trim().split(/\s+/)[0];
  const contact = settings.whatsapp ?? settings.phone;
  const wa = whatsappLink(contact, `Olá! Sobre o orçamento ${number} (${q.title}):`);
  const days = daysToExpire(q.validUntil, today);
  const actions = {
    token,
    number,
    contactName: q.contactName,
    total,
    companyName: settings.companyName,
    preview: staff,
  };

  return (
    <main className="relative min-h-dvh overflow-hidden pb-32 sm:pb-16">
      {canDecide && !staff && <ViewTracker token={token} />}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[420px]">
        <div
          className="absolute inset-0 light:opacity-40"
          style={{
            background:
              "radial-gradient(80% 70% at 50% 15%, color-mix(in srgb, var(--ice-deep) 38%, transparent), transparent 70%), radial-gradient(40% 40% at 50% 12%, color-mix(in srgb, var(--ice) 18%, transparent), transparent 70%)",
          }}
        />
        <SnowField density="calm" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-abyss" />
      </div>

      <div className="relative mx-auto w-full max-w-[210mm] px-4 pt-8 [padding-top:max(2rem,env(safe-area-inset-top))] sm:px-6">
        <header className="no-print flex items-center gap-3">
          <Emblem size={44} priority />
          <div>
            <p className="font-display text-silver-brushed text-base font-bold tracking-[0.08em]">Imperium</p>
            <p className="text-[0.65rem] tracking-[0.12em] text-ice">Tec Refrigeração</p>
          </div>
        </header>

        {staff && (
          <div className="no-print mt-5 flex flex-col gap-2 rounded-2xl bg-night/70 px-4 py-3 text-sm text-steel ring-1 ring-rime sm:flex-row sm:items-center sm:justify-between">
            <p>Você está vendo o orçamento como o cliente vê. Os botões ficam desativados para a equipe.</p>
            <Link href={`/admin/orcamentos/${q.id}`} className="inline-flex shrink-0 items-center gap-1 text-frost hover:underline">
              Abrir no sistema
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        )}

        <section className="no-print glass frost-edge mt-6 rounded-3xl p-5 sm:p-7">
          {canDecide ? (
            <>
              <p className="text-sm text-steel">{first ? `Olá, ${first}! ` : ""}Este é o seu orçamento {number}.</p>
              <h1 className="mt-1.5 text-2xl font-semibold leading-tight text-silver sm:text-[1.7rem]">{q.title}</h1>
              <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div>
                  <p className="text-xs text-steel">Total</p>
                  <p className="readout text-[2rem] font-semibold leading-none text-silver">{total}</p>
                </div>
                <p className={cn("flex items-center gap-1.5 text-sm", days <= 3 ? toneOnTint.brass : "text-steel")}>
                  <Clock className="size-4" />
                  {days === 0 ? "Vence hoje" : days === 1 ? "Vence amanhã" : `Válido até ${formatDate(q.validUntil)}`}
                </p>
              </div>
              <PublicQuoteActions {...actions} className="mt-6" />
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm text-frost hover:underline">
                  <MessageCircle className="size-4" />
                  Tirar dúvidas pelo WhatsApp
                </a>
              )}
            </>
          ) : (
            <Outcome status={status} quote={q} companyName={settings.companyName} wa={wa} />
          )}
        </section>

        <div className="mt-6">
          <QuoteDocument quote={q} company={settings} status={status} />
        </div>

        {canDecide && (
          <div className="no-print mt-6 hidden rounded-2xl bg-night/60 p-5 ring-1 ring-rime sm:block">
            <p className="text-sm text-silver">Tudo certo? Aprove para a gente agendar o serviço.</p>
            <PublicQuoteActions {...actions} variant="inline" className="mt-4" />
          </div>
        )}

        <footer className="no-print mt-10 text-center text-xs text-steel">
          <p>
            {settings.companyName}
            {settings.document ? `, CNPJ ${formatDocument(settings.document)}` : ""}
          </p>
          {contact && <p className="mt-0.5">WhatsApp {formatPhone(contact)}</p>}
        </footer>
      </div>

      {canDecide && (
        <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-rime bg-abyss/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-[0.7rem] text-steel">Total</p>
              <p className="readout truncate text-lg font-semibold leading-tight text-silver">{total}</p>
            </div>
            <PublicQuoteActions {...actions} variant="bar" className="ml-auto flex-1" />
          </div>
        </div>
      )}
    </main>
  );
}

function Outcome({
  status,
  quote,
  companyName,
  wa,
}: {
  status: string;
  quote: { number: number; title: string; validUntil: string; decidedAt: Date | null; decidedByName: string | null };
  companyName: string;
  wa: string | null;
}) {
  const view =
    status === "aprovado"
      ? {
          icon: <CircleCheck className="size-6" />,
          tone: "mint" as const,
          title: "Orçamento aprovado",
          text: `Aprovado em ${formatDate(quote.decidedAt)}${quote.decidedByName ? ` por ${quote.decidedByName}` : ""}. A ${companyName} vai entrar em contato para combinar a data do serviço.`,
          cta: "Falar com a equipe",
        }
      : status === "recusado"
        ? {
            icon: <ThumbsDown className="size-6" />,
            tone: "steel" as const,
            title: "Orçamento recusado",
            text: `Recebemos sua resposta em ${formatDate(quote.decidedAt)}. Mudou de ideia ou quer outra proposta? É só chamar.`,
            cta: "Pedir uma nova proposta",
          }
        : status === "vencido"
          ? {
              icon: <Clock className="size-6" />,
              tone: "brass" as const,
              title: "Orçamento vencido",
              text: `Este orçamento venceu em ${formatDate(quote.validUntil)}. Os valores podem ter mudado: fale com a gente para atualizar.`,
              cta: "Atualizar o orçamento",
            }
          : {
              icon: <Ban className="size-6" />,
              tone: "steel" as const,
              title: "Orçamento cancelado",
              text: `Este orçamento não está mais valendo. Fale com a ${companyName} se ainda precisar do serviço.`,
              cta: "Falar com a equipe",
            };
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-full ring-1",
          view.tone === "mint" ? "bg-mint/12 ring-mint/30" : view.tone === "brass" ? "bg-brass/12 ring-brass/30" : "bg-steel/10 ring-steel/25",
          toneOnTint[view.tone],
        )}
      >
        {view.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-steel">
          {formatQuote(quote.number)}, {quote.title}
        </p>
        <h1 className="font-display text-silver-brushed mt-1 text-2xl font-semibold">{view.title}</h1>
        <p className="mt-2 text-sm text-silver/85">{view.text}</p>
        {wa && (
          <Button asChild size="lg" variant={status === "aprovado" ? "outline" : "default"} className="mt-5 h-11">
            <a href={wa} target="_blank" rel="noreferrer">
              <MessageCircle />
              {view.cta}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
