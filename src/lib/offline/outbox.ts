"use client";

/**
 * Fila de saída (outbox) do app do técnico.
 *
 * Toda alteração que não pode se perder (checklist, medições, observações, mudanças de status,
 * fotos tiradas sem sinal) entra primeiro nesta fila, gravada no IndexedDB, e só sai dela quando
 * a Server Action correspondente confirma. A fila é reenviada em ordem (seq) quando a internet
 * volta, quando o app ganha foco e periodicamente enquanto houver pendências.
 *
 * Os tipos de item (`kind`) são mapeados para Server Actions com `registerOutboxHandlers`.
 */

import { useSyncExternalStore } from "react";
import { idbGet, idbGetAll, idbWrite } from "./idb";

export type OutboxItem<P = unknown> = {
  id: string;
  kind: string;
  payload: P;
  createdAt: number;
  /** ordem de envio (monotônica) */
  seq: number;
  tries: number;
  /** itens com a mesma chave se substituem: vale o último estado (ex.: um item do checklist) */
  key: string | null;
  /** agrupador para indicadores na tela (ex.: id da OM) */
  scope: string | null;
  lastError: string | null;
};

/** `retry: true` = falha temporária (ex.: sessão expirada): o item fica na fila. */
export type OutboxResult = { ok?: boolean; error?: string; retry?: boolean } & Record<string, unknown>;
/** `never` aceita qualquer Server Action com um único argumento. */
export type OutboxHandler = (payload: never) => Promise<OutboxResult | void>;

export type SubmitResult<R extends OutboxResult = OutboxResult> =
  | { queued: true; ok?: undefined; error?: undefined }
  | ({ queued: false } & R);

export type OutboxEvent = {
  type: "sent" | "failed";
  item: OutboxItem;
  result: OutboxResult;
  /** alguém na tela estava esperando este resultado (então ele mesmo mostra o erro) */
  awaited: boolean;
};

type Snapshot = {
  ready: boolean;
  online: boolean;
  flushing: boolean;
  /** a última tentativa falhou por rede mesmo com o aparelho "online" (sinal fraco) */
  stalled: boolean;
  /** o servidor pediu login de novo; a fila espera */
  authRequired: boolean;
  items: OutboxItem[];
};

const MAX_TRIES = 6;
const SERVER_SNAPSHOT: Snapshot = {
  ready: false,
  online: true,
  flushing: false,
  stalled: false,
  authRequired: false,
  items: [],
};

let snapshot: Snapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
const eventListeners = new Set<(e: OutboxEvent) => void>();
const waiters = new Map<string, (r: SubmitResult) => void>();
let handlers: Record<string, OutboxHandler> = {};
let initialized = false;
let lastSeq = 0;
let inflightId: string | null = null;
let flushing: Promise<void> | null = null;
let again = false;
let channel: BroadcastChannel | null = null;

const bySeq = (a: OutboxItem, b: OutboxItem) => a.seq - b.seq;

function set(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) l();
}

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function readAll() {
  try {
    return (await idbGetAll<OutboxItem>()).sort(bySeq);
  } catch {
    return snapshot.items;
  }
}

async function reload() {
  const items = await readAll();
  for (const i of items) lastSeq = Math.max(lastSeq, i.seq);
  set({ items, ready: true });
  return items;
}

function announce() {
  try {
    channel?.postMessage("changed");
  } catch {
    /* outra aba fechada */
  }
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  set({ online: navigator.onLine });
  window.addEventListener("online", () => {
    set({ online: true, stalled: false });
    void flushOutbox();
  });
  window.addEventListener("offline", () => set({ online: false }));
  window.addEventListener("focus", () => void flushOutbox());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushOutbox();
  });
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel("imperium-outbox");
    channel.onmessage = () => void reload();
  }
  window.setInterval(() => {
    if (snapshot.items.length && navigator.onLine) void flushOutbox();
  }, 20_000);
  void reload().then(() => flushOutbox());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  init();
  return () => {
    listeners.delete(listener);
  };
}

/** Mapeia tipos de item → Server Actions (chame no carregamento do módulo). */
export function registerOutboxHandlers(map: Record<string, OutboxHandler>) {
  handlers = { ...handlers, ...map };
}

export function onOutboxEvent(cb: (e: OutboxEvent) => void) {
  eventListeners.add(cb);
  return () => {
    eventListeners.delete(cb);
  };
}

/** Coloca uma alteração na fila (gravada no aparelho antes de qualquer envio). */
export async function enqueue<P>(
  kind: string,
  payload: P,
  opts: { key?: string | null; scope?: string | null } = {},
): Promise<OutboxItem<P>> {
  init();
  const now = Date.now();
  lastSeq = Math.max(now, lastSeq + 1);
  const item: OutboxItem<P> = {
    id: uid(),
    kind,
    payload,
    createdAt: now,
    seq: lastSeq,
    tries: 0,
    key: opts.key ?? null,
    scope: opts.scope ?? null,
    lastError: null,
  };
  const current = await readAll();
  // o item em envio não é substituído: ele termina e o novo vai logo depois (mesma ordem final)
  const replaced = opts.key ? current.filter((i) => i.key === opts.key && i.id !== inflightId).map((i) => i.id) : [];
  try {
    await idbWrite({ put: [item as OutboxItem], remove: replaced });
  } catch {
    // sem armazenamento: mantém só em memória nesta sessão
  }
  set({ items: [...snapshot.items.filter((i) => !replaced.includes(i.id)), item as OutboxItem].sort(bySeq) });
  announce();
  return item;
}

/**
 * Enfileira e, se houver internet, envia na hora e devolve a resposta da Server Action.
 * Sem internet (ou com falha de rede), devolve `{ queued: true }` e o item fica na fila.
 */
export async function submit<R extends OutboxResult = OutboxResult>(
  kind: string,
  payload: unknown,
  opts: { key?: string | null; scope?: string | null } = {},
): Promise<SubmitResult<R>> {
  const item = await enqueue(kind, payload, opts);
  if (!isOnline()) return { queued: true };
  const result = new Promise<SubmitResult<R>>((resolve) => {
    waiters.set(item.id, resolve as (r: SubmitResult) => void);
  });
  void (async () => {
    await flushOutbox();
    if (waiters.has(item.id) && isOnline() && !snapshot.stalled) await flushOutbox();
    const w = waiters.get(item.id);
    if (w) {
      waiters.delete(item.id);
      w({ queued: true });
    }
  })();
  return result;
}

function settle(item: OutboxItem, result: OutboxResult) {
  const w = waiters.get(item.id);
  if (w) {
    waiters.delete(item.id);
    w({ queued: false, ...result });
  }
  const failed = result.ok === false || Boolean(result.error);
  const event: OutboxEvent = { type: failed ? "failed" : "sent", item, result, awaited: Boolean(w) };
  for (const cb of eventListeners) cb(event);
}

function isNetworkError(e: unknown) {
  if (!isOnline()) return true;
  if (e instanceof TypeError) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|network|load failed|fetch failed|connection/i.test(msg);
}

async function drain() {
  set({ flushing: true });
  try {
    do {
      again = false;
      for (;;) {
        if (!isOnline()) return;
        const items = await readAll();
        set({ items });
        const next = items.find((i) => handlers[i.kind]);
        if (!next) break;
        inflightId = next.id;
        let result: OutboxResult | void;
        try {
          // clientAt: quando a pessoa tocou (não quando reenviou); clientId: evita duplicar em reenvio
          const payload =
            next.payload && typeof next.payload === "object"
              ? { ...(next.payload as Record<string, unknown>), clientAt: next.createdAt, clientId: next.id }
              : next.payload;
          result = await handlers[next.kind](payload as never);
        } catch (e) {
          inflightId = null;
          const message = e instanceof Error ? e.message : String(e);
          const stillQueued = await idbGet<OutboxItem>(next.id).catch(() => next);
          if (isNetworkError(e)) {
            if (stillQueued) await idbWrite({ put: [{ ...next, tries: next.tries + 1, lastError: message }] }).catch(() => {});
            set({ stalled: isOnline() });
            return;
          }
          if (next.tries + 1 >= MAX_TRIES) {
            await idbWrite({ remove: [next.id] }).catch(() => {});
            settle(next, { ok: false, error: message || "O servidor recusou a alteração." });
            continue;
          }
          if (stillQueued) await idbWrite({ put: [{ ...next, tries: next.tries + 1, lastError: message }] }).catch(() => {});
          set({ stalled: true });
          return;
        }
        inflightId = null;
        if (result?.retry) {
          await idbWrite({ put: [{ ...next, tries: next.tries + 1, lastError: result.error ?? null }] }).catch(() => {});
          set({ stalled: true, authRequired: true });
          return;
        }
        await idbWrite({ remove: [next.id] }).catch(() => {});
        settle(next, result ?? { ok: true });
        if (snapshot.stalled || snapshot.authRequired) set({ stalled: false, authRequired: false });
      }
    } while (again && isOnline());
  } finally {
    inflightId = null;
    await reload();
    set({ flushing: false });
    announce();
  }
}

async function exclusive(fn: () => Promise<void>) {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks?.request) {
    // outra aba já está enviando: ela cuida da fila (e avisa por BroadcastChannel)
    await locks.request("imperium-outbox-flush", { ifAvailable: true }, async (lock) => {
      if (lock) await fn();
    });
    return;
  }
  await fn();
}

/** Reenvia a fila em ordem. Chamadas simultâneas são agrupadas num único envio. */
export function flushOutbox(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  init();
  if (flushing) {
    again = true;
    return flushing;
  }
  flushing = (async () => {
    try {
      await exclusive(drain);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Último payload ainda não enviado para uma chave (para sobrepor ao dado do servidor). */
export function pendingPayload<P>(items: OutboxItem[], key: string): P | undefined {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].key === key) return items[i].payload as P;
  return undefined;
}

/** Estado da fila + conexão para a interface. */
export function useOutbox() {
  const s = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
  return {
    ...s,
    pending: s.items.length,
    flush: flushOutbox,
    isPending: (key: string) => s.items.some((i) => i.key === key),
    pendingIn: (scope: string) => s.items.filter((i) => i.scope === scope),
  };
}

/** Itens na fila agora (fora do React, ex.: depois de um `await flushOutbox()`). */
export function getOutboxItems() {
  return snapshot.items;
}
