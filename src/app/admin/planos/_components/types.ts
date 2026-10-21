export type DraftTask = {
  key: string;
  id: string | null;
  title: string;
  instructions: string;
  frequencyMonths: number;
  measurementUnit: string;
  requiresPhoto: boolean;
};

export type DraftMaterial = {
  key: string;
  productId: string;
  quantity: string;
};

export type ProductOption = { id: string; name: string; unit: string; sku: string | null; active: boolean };

export type PlanInitial = {
  name: string;
  description: string;
  equipmentTypeId: string;
  isPmoc: boolean;
  estimatedMinutes: number;
  visitReferenceValue: number;
  tasks: DraftTask[];
  materials: DraftMaterial[];
};

/** "1,5" ou "1.5" → 1.5; vazio → null */
export function parseQty(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

export function formatQty(n: number) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
