import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { installAudioFixture } from "./audio-fixture.mjs";
import { testMetadata } from "./test-metadata.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "test-results");
await mkdir(output, { recursive: true });
const audio = path.join(output, "fictional-english.wav");
execFileSync("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "flite=text='The blue bicycle is next to the house.':voice=slt",
  "-af",
  "apad=pad_dur=2",
  "-ar",
  "48000",
  "-ac",
  "1",
  "-t",
  "9",
  audio,
]);
const base = process.env.TEST_URL || "http://127.0.0.1:5180/";
const origin = new URL(base).origin;
// Only local QA injects ephemeral credentials; never recorded or packaged.
const httpCredentials = process.env.QA_HTTP_AUTH ? JSON.parse(process.env.QA_HTTP_AUTH) : undefined;
const label = process.env.QA_REPORT_LABEL || "browser";
const report = {
  ...testMetadata(),
  engine: "Real ONNX models / WASM / Chromium",
  translations: [],
  audioRuns: [],
  tts: "NIEPRZETESTOWANE — brak potwierdzonego odsłuchu lokalnego głosu",
  checks: [],
  externalRequests: [],
  pageErrors: [],
  voices: [],
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-fake-device-for-media-stream",
  ],
  env: { ...process.env, HOME: "/tmp/medpartners-browser-tests" },
});
report.browser = browser.version();
const context = await browser.newContext({
  httpCredentials,
  permissions: ["microphone"],
  viewport: { width: 390, height: 844 },
});
let weightRequests = 0;
context.on("request", (request) => {
  if (request.url().startsWith("blob:") || request.url().startsWith("data:"))
    return;
  if (new URL(request.url()).origin !== origin)
    report.externalRequests.push(request.url());
  if (/\/models\/.*\.onnx$/.test(new URL(request.url()).pathname))
    weightRequests++;
});
const page = await context.newPage();
await installAudioFixture(page, audio);
page.on("pageerror", (error) => report.pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error")
    console.error("BROWSER:", message.text().slice(0, 350));
});

async function ready() {
  await page.waitForFunction(
    () => !document.querySelector("#start").disabled,
    null,
    { timeout: 30_000 },
  );
}
async function stop() {
  if (
    await page
      .locator("#start")
      .innerText()
      .then((s) => s.includes("Zakończ"))
  ) {
    await page.locator("#start").click();
    await page.waitForFunction(
      () => document.querySelector("#status").dataset.phase === "idle",
    );
  }
}
async function selectPair(from, to) {
  await stop();
  await page.locator("#language-a").selectOption(from);
  await page.locator("#language-b").selectOption(to);
}
async function translate(from, to, input, expected, offline = false) {
  await selectPair(from, to);
  await page.locator("#typed").fill(input);
  const previous = await page.locator(".entry").count();
  const began = Date.now();
  await page.locator("#send").click();
  await page.waitForFunction(
    ({ count }) => {
      const rows = document.querySelectorAll(".entry");
      return (
        (rows.length > count &&
          rows[rows.length - 1].querySelector(".translated").textContent !==
            "Tłumaczę…") ||
        !document.querySelector("#error").hidden
      );
    },
    { count: previous },
    { timeout: 180_000 },
  );
  assert.equal(
    await page.locator("#error").isVisible(),
    false,
    await page.locator("#error").textContent(),
  );
  const translated = await page
    .locator(".entry .translated")
    .last()
    .innerText();
  assert.match(translated, expected, `${from}→${to}: ${translated}`);
  report.translations.push({
    from,
    to,
    input,
    output: translated,
    wallMs: Date.now() - began,
    offline,
  });
  // An audible voice is not available in this headless environment. Verify the
  // promised fallback UI once, without reporting an audible TTS test as PASS.
  if (!report.noLocalVoiceCheck &&
      await page.evaluate(() => speechSynthesis.getVoices().length === 0)) {
    await page.waitForFunction(() => document.querySelector("#status").dataset.phase === "listening",
      null, { timeout: 10000 });
    const warning = await page.locator("#warning").innerText();
    assert.match(warning, /Brak lokalnego głosu/);
    assert.equal(await page.locator("#typed").isEnabled(), true);
    assert.equal(await page.locator(".translated").last().innerText(), translated);
    report.noLocalVoiceCheck = { warning, textPreserved: true, textInputEnabled: true,
      audibleTTS: "NIEPRZETESTOWANE" };
  }
  console.log(`PASS ${from}→${to}${offline ? " offline" : ""}: ${translated}`);
  await stop();
}

const routes = [
  ["en", "nl", "The blue bicycle is next to the house.", /fiets/i],
  ["nl", "en", "De blauwe fiets staat naast het huis.", /bicycle|bike/i],
  ["pl", "en", "Niebieski rower stoi obok domu.", /bicycle|bike/i],
  ["en", "pl", "The blue bicycle is next to the house.", /rower/i],
  ["pl", "nl", "Niebieski rower stoi obok domu.", /fiets/i],
  ["nl", "pl", "De blauwe fiets staat naast het huis.", /rower/i],
];
const normalize = (text) => text.toLowerCase().replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim();

try {
  await page.goto(base);
  await ready();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  const manifest = JSON.parse(
    await readFile(path.join(root, "models.lock.json"), "utf8"),
  );
  report.modelBytes = manifest.models.reduce(
    (sum, m) => sum + m.files.reduce((n, f) => n + f.bytes, 0),
    0,
  );
  await page.locator(".text-mode summary").click();
  for (const args of routes) await translate(...args);
  report.checks.push(
    "All six real translation routes produced the expected object, including both English pivots.",
  );
  const before = weightRequests;
  for (const args of routes) await translate(...args);
  assert.equal(
    weightRequests,
    before,
    "Cached weights must not be downloaded again.",
  );
  report.checks.push(
    "Repeated translation reuses verified CacheStorage model files.",
  );

  // Three consecutive native permission + real MediaStream/VAD/ASR/MT runs.
  // A controlled WebAudio source is started only after the production VAD start
  // has resolved and the application has enabled the microphone track.
  await selectPair("en", "nl");
  for (let run = 1; run <= 3; run++) {
    const count = await page.locator(".entry").count();
    const began = Date.now();
    await page.locator("#start").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").dataset.phase === "listening" &&
      window.__qaAudio?.stream.getAudioTracks()[0].enabled,
      null, { timeout: 180_000 });
    const readyMs = Date.now() - began;
    const fixture = await page.evaluate(() => window.__qaAudio.play());
    const played = Date.now();
    await page.waitForFunction(
      ({ count }) => {
        const rows = document.querySelectorAll(".entry");
        return (
          (rows.length > count &&
            rows[rows.length - 1].querySelector(".translated").textContent !==
              "Tłumaczę…") ||
          !document.querySelector("#error").hidden
        );
      },
      { count },
      { timeout: 180_000 },
    );
    assert.equal(
      await page.locator("#error").isVisible(),
      false,
      await page.locator("#error").textContent(),
    );
    const transcript = await page.locator(".entry .original").last().innerText();
    const spokenTranslation = await page
      .locator(".entry .translated")
      .last()
      .innerText();
    assert.equal(normalize(transcript), "the blue bicycle is next to the house");
    assert.equal(normalize(spokenTranslation), "de blauwe fiets ligt naast het huis");
    assert.equal(fixture.nativeCalls, run);
    const audioRun = { run, readyMs, resultAfterPlayMs: Date.now() - played,
      totalMs: Date.now() - began, transcript, translation: spokenTranslation,
      timing: await page.locator(".timing").last().innerText(), fixture };
    report.audioRuns.push(audioRun);
    console.log(`PASS audio ${run}/3: ${JSON.stringify(audioRun)}`);
    await stop();
    await page.waitForFunction(() => window.__qaAudio.stopped &&
      window.__qaAudio.microphone.getTracks().every(t => t.readyState === "ended"));
  }
  report.checks.push("Three consecutive readiness-synchronized audio runs recognize the entire sentence; native capture released after Stop.");
  report.voices = await page.evaluate(() =>
    speechSynthesis
      .getVoices()
      .map((v) => ({ lang: v.lang, local: v.localService })),
  );
  // Stop during an actual VAD utterance; no transcript may arrive afterwards.
  await page.locator("#start").click();
  await page.waitForFunction(() => document.querySelector("#status").dataset.phase === "listening");
  await page.evaluate(() => window.__qaAudio.play());
  await page.waitForFunction(() => document.querySelector("#status").dataset.phase === "speech");
  await stop();
  await page.waitForFunction(() => window.__qaAudio.stopped &&
    window.__qaAudio.microphone.getTracks().every(t => t.readyState === "ended"));
  const stoppedCount = await page.locator(".entry").count();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator(".entry").count(), stoppedCount);
  report.checks.push(
    "Stop prevents later audio completions from adding conversation rows.",
  );

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  if (process.env.QA_AUTH_CONTROL_BASE) {
    assert.equal((await context.request.post(process.env.QA_AUTH_CONTROL_BASE + "revoke")).status(), 200);
    assert.equal((await context.request.get(base)).status(), 401);
    report.checks.push("Network Basic Auth revoked: authenticated network request returns 401; subsequent offline test uses the retained local copy.");
  }
  await context.setOffline(true);
  await page.reload();
  await ready();
  await page.locator(".text-mode summary").click();
  for (const args of routes) await translate(...args, true);
  report.checks.push(
    "Offline reload and all six real translation routes use the saved application and models.",
  );
  await page.locator("#clear").click();
  assert.equal(await page.locator(".entry").count(), 0);
  report.checks.push("Local session history can be erased.");
  await context.setOffline(false);
  if (process.env.QA_AUTH_CONTROL_BASE)
    assert.equal((await context.request.post(process.env.QA_AUTH_CONTROL_BASE + "restore")).status(), 200);

  // No microphone permission is granted in this separate context.
  const denied = await browser.newContext({ httpCredentials });
  const deniedPage = await denied.newPage();
  await deniedPage.goto(base);
  await deniedPage.waitForFunction(
    () => !document.querySelector("#start").disabled,
  );
  await deniedPage.locator("#start").click();
  await deniedPage
    .locator("#error")
    .waitFor({ state: "visible", timeout: 20_000 });
  assert.match(
    await deniedPage.locator("#error").innerText(),
    /mikrofon|zgod/i,
  );
  report.checks.push(
    "Denied microphone permission produces a visible recoverable error.",
  );
  await denied.close();
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.pageErrors, []);
  report.checks.push(
    "Zero requests to external origins; zero uncaught page errors.",
  );
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.stack || String(error);
  console.error(report.error);
  await page
    .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(
    path.join(output, `${label}-results.json`),
    JSON.stringify({ ...report, completedAt: new Date().toISOString() }, null, 2),
  );
  await browser.close();
}
