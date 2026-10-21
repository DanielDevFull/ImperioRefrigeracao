import type { ZodError } from "zod";

/** Estado devolvido pelas Server Actions de formulário (useActionState). */
export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** id do registro criado/alterado, quando útil para redirecionar */
  id?: string;
};

export const initialActionState: ActionState = {};

export function zodFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Executa a ação capturando erros de regra de negócio como mensagem amigável. */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const r = await fn();
    return r ?? { ok: true };
  } catch (e) {
    // redirect()/notFound() do Next precisam continuar propagando
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_")) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Algo deu errado. Tente novamente." };
  }
}

/** Lê campos de FormData de forma tipada e tolerante (strings vazias viram null). */
export function formValues(fd: FormData) {
  const get = (k: string) => {
    const v = fd.get(k);
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  return {
    str: get,
    num: (k: string) => {
      const v = get(k);
      if (v == null) return null;
      const n = Number(v.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    },
    /** número em formato brasileiro "1.234,56" ou "1234.56" */
    money: (k: string) => {
      const v = get(k);
      if (v == null) return null;
      const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
      const n = Number(normalized.replace(/[^\d.-]/g, ""));
      return Number.isFinite(n) ? n : null;
    },
    bool: (k: string) => {
      const v = fd.get(k);
      return v === "on" || v === "true" || v === "1";
    },
    all: (k: string) => fd.getAll(k).map(String).filter(Boolean),
  };
}
