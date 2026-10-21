// Exercita as mutações do portal do cliente (rodar a partir da raiz do repo).
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

const S = "/tmp/claude-0/-home-user-ImperioRefrigeracao/464c8f32-8241-5a6c-bf1c-49fdfd6f9c7f/scratchpad";
const shots = path.join(S, "shots");
const base = "http://localhost:3000";
const [, , step = "all"] = process.argv;

const FOREIGN_REC = "0360fd81-07dc-4d83-b5ca-60a5785896df";
const FOREIGN_OM = "0b69e575-392e-4c4b-9103-6772f9c035a7";
const FOREIGN_EQ = "fe058f89-9aa3-419d-9e33-3cb5bd1da4df";
const EQ = "37cdb146-c489-4201-8861-56cfcd137c52";
const UNRATED_OM = "7599a7b2-4ebb-42f0-ac08-30df3ed80353";

const pngPath = path.join(S, "proof.png"); // gerado antes (24x24 azul)

const browser = await chromium.launch({
  executablePath: existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
    : undefined,
});

async function login(mobile = false) {
  const ctx = await browser.newContext({
    ...(mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } }),
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("response", (r) => r.status() === 404 && console.log("404", r.url()));
  page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text().slice(0, 300)));
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", "cliente@imperiumtec.com.br");
  await page.fill("#password", "cliente123");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname.startsWith("/portal"), { timeout: 30000 });
  return { ctx, page };
}

if (step === "all" || step === "pay") {
  const { ctx, page } = await login();
  await page.goto(base + "/portal/mensalidades", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Pagar", exact: true }).first().click();
  await page.getByText("Pix copia e cola", { exact: true }).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, "pay-dialog-desktop.png") });
  await page.getByRole("button", { name: /Copiar código Pix/ }).click();
  await page.getByText("Código Pix copiado").waitFor({ timeout: 5000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  console.log("clipboard:", clip.slice(0, 60), "...", clip.slice(-8));

  // Tentativa com id de outro cliente (deve falhar)
  await page.getByRole("button", { name: /Já paguei/ }).click();
  await page.locator("input[name=comprovante]").setInputFiles(pngPath);
  await page.evaluate((id) => {
    document.querySelector("input[name=receivableId]").value = id;
  }, FOREIGN_REC);
  await page.getByRole("button", { name: "Enviar comprovante" }).click();
  await page.getByRole("alert").filter({ hasText: "Cobrança não encontrada" }).waitFor({ timeout: 15000 });
  console.log("foreign proof: rejected OK");
  await ctx.close();

  // Envio real
  const s2 = await login();
  const p2 = s2.page;
  await p2.goto(base + "/portal/mensalidades", { waitUntil: "networkidle" });
  await p2.getByRole("button", { name: "Pagar", exact: true }).first().click();
  await p2.getByRole("button", { name: /Já paguei/ }).click();
  await p2.locator("input[name=comprovante]").setInputFiles(pngPath);
  await p2.waitForTimeout(300);
  await p2.screenshot({ path: path.join(shots, "pay-upload-desktop.png") });
  await p2.getByRole("button", { name: "Enviar comprovante" }).click();
  await p2.getByText("Comprovante em análise").first().waitFor({ timeout: 15000 });
  await p2.waitForTimeout(250);
  await p2.screenshot({ path: path.join(shots, "pay-sent-desktop.png") });
  await p2.waitForTimeout(1500);
  await p2.screenshot({ path: path.join(shots, "pay-sent-after-desktop.png") });
  console.log("proof sent OK");
  await s2.ctx.close();
}

if (step === "all" || step === "paymobile") {
  const { ctx, page } = await login(true);
  await page.goto(base + "/portal/mensalidades", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^(Pagar|Ver envio)$/ }).first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(shots, "pay-dialog-mobile.png") });
  await ctx.close();
}

if (step === "all" || step === "request") {
  const { ctx, page } = await login();
  await page.goto(base + `/portal/atendimentos/novo?equipmentId=${EQ}`, { waitUntil: "networkidle" });
  await page.getByText("Não gela", { exact: true }).click();
  await page.getByText("Pingando água", { exact: true }).click();
  await page.fill("#descricao", "Teste automatizado do portal: o ar da cozinha não gela e está pingando.");
  await page.getByText("Alta", { exact: true }).click();
  await page.locator("input[name=fotos]").setInputFiles(pngPath);
  await page.fill("input[name=periodo]", "manhãs");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, "novo-filled-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Enviar solicitação" }).click();
  await page.waitForURL((u) => u.searchParams.has("criado"), { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shots, "novo-success-desktop.png"), fullPage: true });
  console.log("request created:", page.url());
  await ctx.close();
}

if (step === "all" || step === "rate") {
  const { ctx, page } = await login();
  await page.goto(base + `/portal/atendimentos/${UNRATED_OM}`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /5 de 5/ }).click();
  await page.fill("#rating-comment", "Atendimento pontual e caprichado. (teste automatizado)");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, "rate-filled-desktop.png") });
  await page.getByRole("button", { name: "Enviar avaliação" }).click();
  await page.getByText("Sua avaliação").waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, "rate-done-desktop.png") });
  console.log("rated OK");
  await ctx.close();
}

if (step === "all" || step === "foreign") {
  const { ctx, page } = await login();
  for (const u of [
    `/portal/atendimentos/${FOREIGN_OM}`,
    `/portal/equipamentos/${FOREIGN_EQ}`,
    `/portal/mensalidades/${FOREIGN_REC}/recibo`,
    `/portal/atendimentos/nao-e-um-id`,
  ]) {
    const res = await page.goto(base + u);
    const body = await page.textContent("body");
    console.log(u, "->", res.status(), /could not be found|não encontrad|404/i.test(body) ? "(not found page)" : body.slice(0, 120));
  }
  await ctx.close();
}

await browser.close();
