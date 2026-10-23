import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url);
const output = new URL("test-results/", root);
await mkdir(output, { recursive: true });
const mount = "/site/5180";
const upstream = process.env.PREVIEW_UPSTREAM || "http://127.0.0.1:5180";
const apache = await readFile(new URL("dist/.htaccess", root), "utf8");
const csp = apache.match(/Content-Security-Policy "([^"]+)"/)[1];
// Real HTTP proxy, including a production CSP header. No model or inference mocks.
const server = http.createServer((request, response) => {
  const address = new URL(request.url, "http://localhost");
  if (address.pathname === "/frame.html") {
    response.writeHead(200, {
      "Content-Type": "text/html",
      "Permissions-Policy": "microphone=()",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    response.end(`<iframe src="${mount}/" width="450" height="900"></iframe>`);
    return;
  }
  if (address.pathname !== mount && !address.pathname.startsWith(mount + "/")) {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Outside preview mount");
    return;
  }
  const target = new URL((address.pathname.slice(mount.length) || "/") + address.search, upstream);
  const forwarded = http.get(target, (result) => {
    const headers = { ...result.headers };
    if (headers["content-type"]?.includes("text/html")) {
      // A separate frame test deliberately permits embedding; microphone remains denied by parent.
      headers["content-security-policy"] = csp.replace("; frame-ancestors 'none'", "");
    }
    response.writeHead(result.statusCode, headers);
    result.pipe(response);
  });
  forwarded.on("error", (error) => { response.destroy(error); });
  response.on("close", () => forwarded.destroy());
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const base = origin + mount;
const report = { upstream, proxy: base, checks: [], models: [], passed: false };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
  env: { ...process.env, HOME: "/tmp/medpartners-preview-tests" },
});
const check = (text) => { report.checks.push(text); console.log("PASS", text); };
try {
  for (const suffix of ["", "/", "/index.html"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(base + suffix + "?preview=1#conversation");
    await page.waitForFunction(() => document.documentElement.dataset.startup === "ready");
    assert.equal(await page.locator("#start").isEnabled(), true);
    await page.locator(".text-mode summary").click();
    await page.locator("#typed").fill("Test");
    assert.equal(await page.locator("#send").isEnabled(), true);
    assert.match(await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily), /Inter/);
    assert.equal(new URL(page.url()).search, "?preview=1");
    assert.equal(new URL(page.url()).hash, "#conversation");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert.deepEqual(errors, []);
    check(`Prefix ${suffix || "(no trailing slash)"}: CSS, JS, controls, production CSP and service worker`);
    await context.close();
  }

  for (const resource of ["script", "stylesheet", "script-timeout", "manifest-timeout", "manifest-invalid"]) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    if (resource === "script-timeout") {
      await page.route("**/assets/*.js", () => {});
    } else if (resource === "script" || resource === "stylesheet") {
      await page.route("**/assets/*", (route) => route.request().resourceType() === resource
        ? route.abort("failed") : route.continue());
    } else {
      await page.route("**/models-manifest.json", resource === "manifest-timeout"
        ? () => {} : (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html>Wrong route</html>" }));
    }
    const began = Date.now();
    await page.goto(base + "/", { waitUntil: "commit" });
    await page.locator("#error").waitFor({ state: "visible", timeout: 22_000 });
    const text = await page.locator("#error").textContent();
    assert.equal(await page.locator("#retry-startup").isVisible(), true);
    assert.notEqual(await page.locator("#status").textContent(), "Sprawdzam dostępne pakiety…");
    if (resource === "manifest-timeout") assert.match(text, /15 sekund/);
    check(`${resource}: visible error and reload control after ${Date.now() - began} ms`);
    // Once the actual network fault is removed, reload must recover without clearing model storage.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.locator("#retry-startup").click();
    await page.waitForFunction(() => document.documentElement.dataset.startup === "ready");
    assert.equal(await page.locator("#error").isVisible(), false);
    check(`${resource}: reload recovers after the network fault is removed`);
    await context.close();
  }

  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  await page.goto(origin + "/frame.html");
  const frame = page.frames().find((f) => f.url().startsWith(base));
  await frame.waitForFunction(() => document.documentElement.dataset.startup === "ready");
  assert.equal(await frame.locator("#start").isDisabled(), true);
  assert.match(await frame.locator("#microphone-info").innerText(), /ramka.*blokuje mikrofon/);
  await frame.locator("#language-a").selectOption("en");
  await frame.locator("#language-b").selectOption("nl");
  await frame.locator(".text-mode summary").click();
  await frame.locator("#typed").fill("The blue bicycle is next to the house.");
  assert.equal(await frame.locator("#send").isEnabled(), true);
  await frame.locator("#send").click();
  await frame.waitForFunction(() => document.querySelector(".translated")?.textContent.includes("fiets"), null, { timeout: 180_000 });
  report.frameTranslation = await frame.locator(".translated").innerText();
  check("Microphone denied by iframe Permissions-Policy: visible explanation; real text translation still succeeds");
  await context.close();

  const manifest = JSON.parse(await readFile(new URL("models.lock.json", root), "utf8"));
  for (const model of manifest.models) for (const file of model.files) {
    const url = `${base}/models/${model.id}/${file.path}`;
    const response = await fetch(url);
    assert.equal(response.status, 200, url);
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of response.body) { bytes += chunk.length; hash.update(chunk); }
    assert.equal(bytes, file.bytes, url);
    assert.equal(hash.digest("hex"), file.sha256, url);
    report.models.push({ url, bytes, verified: true });
  }
  check(`All ${report.models.length} model artifacts downloaded through preview prefix: HTTP 200, length and SHA-256 match`);

  // The existing complete suite performs real six-direction MT, microphone/VAD/ASR and offline tests.
  if (process.env.FULL_PREVIEW_TEST === "1") {
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, ["scripts/browser-test.mjs"], {
        cwd: root,
        env: { ...process.env, TEST_URL: base },
        stdio: "inherit",
      });
      child.on("exit", resolve);
      child.on("error", () => resolve(1));
    });
    assert.equal(code, 0, "Full real-model browser suite through the preview prefix");
    check("Complete browser suite also passes through slashless preview prefix");
  }
  report.passed = true;
} catch (error) {
  report.error = error.stack || String(error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  await writeFile(new URL("preview-results.json", output), JSON.stringify(report, null, 2));
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
