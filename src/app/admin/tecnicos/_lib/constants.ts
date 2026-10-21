/** Cores disponíveis para o técnico (agenda e avatares), compatíveis com a paleta da marca. */
export const TECH_COLORS = [
  { value: "#38a8ff", label: "Gelo" },
  { value: "#b8e3ff", label: "Geada" },
  { value: "#3ee0b5", label: "Menta" },
  { value: "#e8b04b", label: "Latão" },
  { value: "#9b8cff", label: "Violeta" },
  { value: "#ff8a5c", label: "Cobre" },
  { value: "#f07cb4", label: "Rosa" },
  { value: "#c9d6e6", label: "Prata" },
] as const;

export const DEFAULT_TECH_COLOR = TECH_COLORS[0].value;

export const SKILL_PRESETS = [
  "Split",
  "Cassete",
  "Piso-teto",
  "VRF",
  "Câmara fria",
  "Refrigeração comercial",
  "Instalação",
  "Elétrica",
];

/** Placa no padrão antigo (ABC-1234) ou Mercosul (ABC1D23). */
export const PLATE_RE = /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/;

export function normalizePlate(v: string | null | undefined) {
  if (!v) return null;
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== 7) return v.toUpperCase().trim();
  // mesmo formato dos cadastros existentes: ABC-1D23 / ABC-1234
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function vehicleLocationName(plate: string, name: string) {
  return `Veículo ${plate} — ${firstName(name)}`;
}
