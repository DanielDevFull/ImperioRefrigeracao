"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { quotes } from "@/db/schema";
import { type ActionState, formValues, runAction } from "@/lib/action";
import { approveQuote, markQuoteViewed, rejectQuote } from "@/server/quotes";

/**
 * Ações do link público do orçamento (sem login): o token de 24 caracteres é a credencial.
 * Só aprovam/recusam o próprio orçamento e nunca devolvem dados internos.
 */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

async function quoteIdFor(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const q = await db.query.quotes.findFirst({ where: eq(quotes.publicToken, token), columns: { id: true } });
  return q?.id ?? null;
}

function revalidateAfterDecision(token: string, quoteId: string) {
  revalidatePath(`/orcamento/${token}`);
  revalidatePath("/admin/orcamentos");
  revalidatePath(`/admin/orcamentos/${quoteId}`);
  revalidatePath("/admin/oms");
  revalidatePath("/admin/agenda");
  revalidatePath("/admin");
}

export async function approvePublicQuote(token: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = await quoteIdFor(token);
    if (!id) return { ok: false, error: "Orçamento não encontrado. Confira o link que você recebeu." };
    const name = formValues(fd).str("name")?.slice(0, 120) ?? null;
    if (!name || name.length < 2) return { ok: false, error: "Informe seu nome para aprovar.", fieldErrors: { name: "Informe seu nome." } };
    await db.transaction((tx) => approveQuote(tx, id, { via: "cliente", actor: { userId: null }, decidedByName: name }));
    revalidateAfterDecision(token, id);
    return { ok: true, message: "Orçamento aprovado. Obrigado!" };
  });
}

export async function rejectPublicQuote(token: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = await quoteIdFor(token);
    if (!id) return { ok: false, error: "Orçamento não encontrado. Confira o link que você recebeu." };
    const v = formValues(fd);
    const reason = v.str("reason")?.slice(0, 500) ?? null;
    const name = v.str("name")?.slice(0, 120) ?? null;
    await db.transaction((tx) => rejectQuote(tx, id, { via: "cliente", actor: { userId: null }, decidedByName: name, reason }));
    revalidateAfterDecision(token, id);
    return { ok: true, message: "Recebemos sua resposta. Obrigado!" };
  });
}

/** Registra a primeira abertura do link (chamado pelo navegador do cliente). */
export async function quoteViewed(token: string) {
  if (!TOKEN_RE.test(token)) return;
  await markQuoteViewed(token);
}
