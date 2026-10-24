import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { testMetadata } from "./test-metadata.mjs";

const root = new URL("../", import.meta.url);
const report = { ...testMetadata(), checks: [], passed: false };
const reserve = createServer();
reserve.listen(0, "127.0.0.1");
await once(reserve, "listening");
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const dev = spawn(process.execPath, [fileURLToPath(new URL("node_modules/vite/bin/vite.js", root)),
  "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root });
let devLog = "";
let devFailure;
const capture = data => { devLog = (devLog + data.toString()).slice(-16_000); };
dev.stdout.on("data", capture);
dev.stderr.on("data", capture);
dev.once("error", error => { devFailure = error; });
dev.once("exit", code => { devFailure = new Error(`Vite exited ${code}`); });
let browser;
try {
  // CI may suppress Vite's banner. Readiness is a real HTTP response, not a
  // stdout substring; the browser below still verifies every CSP/nonce claim.
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (devFailure) throw devFailure;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_000) });
      await response.arrayBuffer();
      if (response.status === 200) break;
    } catch { /* Server not ready yet; keep the bounded startup deadline. */ }
    if (Date.now() >= deadline) throw new Error("Vite HTTP startup timeout (20 seconds)");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"], env: { ...process.env, HOME: "/tmp/medpartners-csp-tests" } });
  for (const [mode, url] of [["dev", `http://127.0.0.1:${port}/`],
    ["preview", process.env.TEST_URL || "http://127.0.0.1:5180/"]]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.startup === "ready");
    assert.match(await page.locator("body").evaluate(el => getComputedStyle(el).fontFamily), /Inter/);
    assert.deepEqual(errors, [], `${mode}: no startup/CSP errors`);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    assert.ok(!csp.includes("'unsafe-inline'") && !csp.includes("'unsafe-eval'"));
    const nonce = await page.evaluate(() => document.querySelector('meta[property="csp-nonce"]')?.nonce);
    if (mode === "dev") {
      assert.ok(nonce && csp.includes(`'nonce-${nonce}'`));
      assert.ok(await page.locator("style[data-vite-dev-id]").count() > 0);
      assert.equal(await page.evaluate(n => [...document.querySelectorAll("style[data-vite-dev-id]")].every(s => s.nonce === n), nonce), true);
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.startup === "ready");
      const next = await page.evaluate(() => document.querySelector('meta[property="csp-nonce"]')?.nonce);
      assert.ok(next && next !== nonce, "unique nonce per HTML response");
    } else {
      assert.equal(nonce, undefined);
      assert.ok(!csp.includes("'nonce-"));
      const apache = await readFile(new URL("dist/.htaccess", root), "utf8");
      assert.ok(apache.includes(csp));
      assert.ok(!apache.includes("'unsafe-inline'") && !apache.includes("'unsafe-eval'"));
    }
    // Browser enforcement, not just string matching: untrusted inline code/styles
    // must remain blocked even though development styles now work.
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = "body { --untrusted-inline-style: blocked; }";
      document.head.append(style);
      const script = document.createElement("script");
      script.textContent = "window.__untrustedInlineRan = true";
      document.head.append(script);
    });
    assert.equal(await page.evaluate(() => window.__untrustedInlineRan), undefined);
    assert.equal(await page.locator("body").evaluate(el => getComputedStyle(el).getPropertyValue("--untrusted-inline-style")), "");
    report.checks.push(`${mode}: styled UI; enforced blocking of untrusted inline JS/CSS; no unsafe directives${mode === "dev" ? "; fresh style nonce per response" : "; unchanged production CSP and matching Apache header"}`);
    console.log("PASS", report.checks.at(-1));
    await context.close();
  }
  report.passed = true;
} catch (error) {
  report.error = error.stack || String(error);
  report.devLog = devLog;
  console.error(report.error);
  console.error("Vite stdout/stderr:\n" + devLog);
  process.exitCode = 1;
} finally {
  await browser?.close();
  dev.kill("SIGTERM");
  await mkdir(new URL("test-results/", root), { recursive: true });
  await writeFile(new URL("test-results/csp-results.json", root), JSON.stringify({ ...report, completedAt: new Date().toISOString() }, null, 2));
}
