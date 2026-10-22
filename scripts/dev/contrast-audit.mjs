/**
 * Auditoria de contraste (axe-core, regra color-contrast) de uma página logada.
 * node scripts/dev/contrast-audit.mjs <caminho> [--as admin|financeiro|tecnico|cliente|anonimo]
 *   [--scheme light|dark] [--mobile] [--wait ms]
 * Lista cada texto abaixo do mínimo WCAG AA (4,5:1; 3:1 para texto grande) com as cores medidas.
 * "Indeterminados" são textos sobre gradiente/imagem que o axe não consegue medir: confira no print.
 * Requer `pnpm dev` rodando em http://localhost:3000.
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const [, , route = "/", ...rest] = process.argv;
const flag = (n) => rest.includes(n);
const opt = (n, d) => {
  const i = rest.indexOf(n);
  return i >= 0 ? rest[i + 1] : d;
};
const who = opt("--as", "admin");
const scheme = opt("--scheme", "light");
const base = process.env.BASE_URL ?? "http://localhost:3000";
const creds = {
  admin: ["admin@imperiumtec.com.br", "imperium123"],
  financeiro: ["financeiro@imperiumtec.com.br", "imperium123"],
  tecnico: ["rafael@imperiumtec.com.br", "tecnico123"],
  cliente: ["cliente@imperiumtec.com.br", "cliente123"],
  anonimo: null,
};
const stateDir = path.join(process.cwd(), ".next", "shot-state");
mkdirSync(stateDir, { recursive: true });
const statePath = path.join(stateDir, `${who}.json`);

const browser = await chromium.launch({
  executablePath: existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
    : undefined,
});
const ctxOpts = {
  ...(flag("--mobile")
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 } }),
  colorScheme: scheme === "dark" ? "dark" : "light",
  reducedMotion: "reduce",
};
const ctx = await browser.newContext(creds[who] && existsSync(statePath) ? { ...ctxOpts, storageState: statePath } : ctxOpts);
const page = await ctx.newPage();
await page.goto(base + route, { waitUntil: "networkidle" });
if (creds[who] && page.url().includes("/login")) {
  await page.fill("#email", creds[who][0]);
  await page.fill("#password", creds[who][1]);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await ctx.storageState({ path: statePath });
  await page.goto(base + route, { waitUntil: "networkidle" });
}
await page.waitForTimeout(Number(opt("--wait", "1500")));
// Gradientes suaves (névoa do <body>, .panel e .glass) fazem o axe marcar quase tudo como
// indeterminado; para medir, viram a cor sólida equivalente (página ou cartão), diferença desprezível.
await page.addStyleTag({
  content: "body{background-image:none!important} .panel,.glass{background:var(--night)!important}",
});
await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
const result = await page.evaluate(async () => {
  const r = await axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] }, resultTypes: ["violations", "incomplete"] });
  const pick = (n) => ({
    target: n.target.join(" "),
    text: (n.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || n.html).slice(0, 70),
    ...(n.any[0]?.data ?? {}),
  });
  return {
    violations: r.violations.flatMap((v) => v.nodes.map(pick)),
    incomplete: r.incomplete.flatMap((v) => v.nodes.map(pick)).length,
  };
});
console.log(`${route} [${scheme}] ${page.url()}`);
if (!result.violations.length) console.log("  sem violações de contraste");
for (const v of result.violations) {
  console.log(`  ✗ ${v.contrastRatio}:1 (mín. ${v.expectedContrastRatio}) fg ${v.fgColor} bg ${v.bgColor} — "${v.text}"\n      ${v.target}`);
}
console.log(`  indeterminados (gradiente/imagem): ${result.incomplete}`);
await browser.close();
