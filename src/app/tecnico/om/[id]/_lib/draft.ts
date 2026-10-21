"use client";

import type { SignatureStroke } from "../_components/signature-pad";

/** Rascunho da conclusão guardado no aparelho (sobrevive a recarregar a página sem sinal). */
export type ConclusionDraft = {
  solution: string;
  diagnosis: string;
  technicianNotes: string;
  signedByName: string;
  strokes: SignatureStroke[] | null;
};

const key = (id: string) => `imperium:conclusao:${id}`;

export function loadDraft(id: string): Partial<ConclusionDraft> | null {
  try {
    const raw = localStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as Partial<ConclusionDraft>) : null;
  } catch {
    return null;
  }
}

export function saveDraft(id: string, draft: ConclusionDraft) {
  try {
    localStorage.setItem(key(id), JSON.stringify(draft));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem rascunho */
  }
}

export function clearDraft(id: string) {
  try {
    localStorage.removeItem(key(id));
  } catch {
    /* ignore */
  }
}
