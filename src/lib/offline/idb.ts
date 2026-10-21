/**
 * Wrapper mínimo (com promessas) sobre o IndexedDB, sem dependências.
 * Se o navegador não tiver IndexedDB (ou bloquear, como em algumas abas anônimas),
 * cai para memória: o app continua funcionando, só não sobrevive a um recarregamento.
 */

const DB_NAME = "imperium-offline";
const DB_VERSION = 1;
export const OUTBOX_STORE = "outbox";

type Row = { id: string } & Record<string, unknown>;

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, Row>();

function promisify<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transação do IndexedDB abortada"));
  });
}

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

export async function idbGetAll<T extends Row>(store = OUTBOX_STORE): Promise<T[]> {
  const db = await open();
  if (!db) return [...memory.values()] as T[];
  const tx = db.transaction(store, "readonly");
  return (await promisify(tx.objectStore(store).getAll())) as T[];
}

export async function idbGet<T extends Row>(id: string, store = OUTBOX_STORE): Promise<T | undefined> {
  const db = await open();
  if (!db) return memory.get(id) as T | undefined;
  const tx = db.transaction(store, "readonly");
  return (await promisify(tx.objectStore(store).get(id))) as T | undefined;
}

/** Grava `put` e apaga `remove` numa única transação. */
export async function idbWrite(
  { put = [], remove = [] }: { put?: Row[]; remove?: string[] },
  store = OUTBOX_STORE,
): Promise<void> {
  const db = await open();
  if (!db) {
    for (const id of remove) memory.delete(id);
    for (const row of put) memory.set(row.id, row);
    return;
  }
  const tx = db.transaction(store, "readwrite");
  const s = tx.objectStore(store);
  for (const id of remove) s.delete(id);
  for (const row of put) s.put(row);
  await done(tx);
}

/** O armazenamento é persistente (IndexedDB) ou só em memória? */
export async function idbIsPersistent() {
  return (await open()) != null;
}
