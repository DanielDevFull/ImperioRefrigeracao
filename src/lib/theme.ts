/**
 * Tema da interface: "system" segue o aparelho (resolvido só em CSS, com prefers-color-scheme),
 * "light" e "dark" fixam a escolha. O servidor já renderiza a classe certa no <html>, sem piscar.
 */
export const THEME_PREFS = ["system", "light", "dark"] as const;
export type ThemePref = (typeof THEME_PREFS)[number];
export type ResolvedTheme = "light" | "dark";

/** Escolha do aparelho para as telas sem login (o usuário logado usa a preferência da conta). */
export const THEME_COOKIE = "tema";

export const themeLabel: Record<ThemePref, string> = {
  system: "Automático",
  light: "Claro",
  dark: "Escuro",
};

export function isThemePref(v: unknown): v is ThemePref {
  return typeof v === "string" && (THEME_PREFS as readonly string[]).includes(v);
}

/** Classe aplicada no <html>: "light", "dark" ou "theme-system". */
export function themeClass(pref: ThemePref) {
  return pref === "system" ? "theme-system" : pref;
}

/** Cor da barra do navegador/PWA (fundo da página em cada tema). */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#f2f6fb",
  dark: "#040914",
};

/** Cores das duas metas theme-color (uma por esquema do aparelho), conforme a escolha. */
export function themeColors(pref: ThemePref): Record<ResolvedTheme, string> {
  return {
    light: pref === "dark" ? THEME_COLOR.dark : THEME_COLOR.light,
    dark: pref === "light" ? THEME_COLOR.light : THEME_COLOR.dark,
  };
}
