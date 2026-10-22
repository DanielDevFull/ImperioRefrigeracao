/**
 * Screenshot de uma página logada (desenvolvimento).
 * node scripts/dev/screenshot.mjs <caminho> <saida.png> [--as admin|financeiro|tecnico|cliente] [--mobile] [--full] [--wait ms]
 *   [--scheme light|dark]
 * --scheme emula o tema do aparelho; vale para contas com tema "Automático" (o padrão da demo).
 * Requer `pnpm dev` rodando em http://localhost:3000.
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const [, , route = "/", out = "shot.png", ...rest] = process.argv;
const flag = (n) => rest.includes(n);
const opt = (n, d) => {
  const i = rest.indexOf(n);
  return i >= 0 ? rest[i + 1] : d;
};
const who = opt("--as", "admin");
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
const mobile = flag("--mobile");
const scheme = opt("--scheme", "dark");
const ctxOpts = {
  ...(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }),
  colorScheme: scheme === "light" ? "light" : "dark",
};

async function newContext() {
  if (creds[who] && existsSync(statePath)) return browser.newContext({ ...ctxOpts, storageState: statePath });
  return browser.newContext(ctxOpts);
}
let ctx = await newContext();
let page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base + route, { waitUntil: "networkidle" });
if (creds[who] && page.url().includes("/login")) {
  await page.fill("#email", creds[who][0]);
  await page.fill("#password", creds[who][1]);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await ctx.storageState({ path: statePath });
  await page.goto(base + route, { waitUntil: "networkidle" });
}
await page.waitForTimeout(Number(opt("--wait", "1200")));
await page.screenshot({ path: out, fullPage: flag("--full") });
console.log(`ok ${page.url()} -> ${out}`);
if (errors.length) console.log(`erros na página:\n- ${errors.join("\n- ")}`);
await browser.close();
