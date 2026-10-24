import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareModels, verifyArtifact, artifactUrl, modelCacheName } from "../src/cache.ts";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { installationBase, cacheNamesForPath } from "../src/installation.ts";
import type { Model } from "../src/core.ts";

test("model integrity checks accept only exact SHA-256 and length", async () => {
  const data = new TextEncoder().encode("fictional fixture").buffer;
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const file = { path: "model.onnx", bytes: data.byteLength, sha256: hash };
  await verifyArtifact(data, file);
  await assert.rejects(
    verifyArtifact(data, { ...file, bytes: data.byteLength + 1 }),
    /Nieprawidłowy/,
  );
  await assert.rejects(
    verifyArtifact(data, { ...file, sha256: "0".repeat(64) }),
    /Nieprawidłowy/,
  );
});

test("a stalled HTTP body is cancelled, no partial cache is saved, retry verifies SHA", async () => {
  const data = Buffer.from("complete fictional model fixture");
  const file = { path: "model.onnx", bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex") };
  const models = [{ id: "asr", files: [file] }] as Model[];
  const saved = new Map<string, Response>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async () => ({
    match: async (url: string) => saved.get(url)?.clone(),
    delete: async (url: string) => saved.delete(url),
    put: async (url: string, response: Response) => { saved.set(url, response.clone()); },
  }) } });
  let attempt = 0;
  let closed!: () => void;
  const disconnected = new Promise<void>(resolve => { closed = resolve; });
  const server = createServer((_request, response) => {
    attempt++;
    response.writeHead(200, { "Content-Type": "application/octet-stream" });
    if (attempt === 1) {
      response.write(data.subarray(0, 4));
      response.on("close", closed); // No end(): an actual stalled network stream.
    } else response.end(data);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/`;
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: new URL(base).origin } });
  try {
    let partial = 0;
    await assert.rejects(prepareModels(base, models, new AbortController().signal,
      (done) => { partial = done; }, 100), /brak danych.*ponów/);
    await disconnected;
    assert.equal(partial, 4);
    assert.equal(saved.size, 0, "partial file cannot be cached");
    await prepareModels(base, models, new AbortController().signal, () => {}, 1000);
    assert.equal(attempt, 2);
    assert.equal(saved.size, 1);
    const result = saved.values().next().value!;
    await verifyArtifact(await result.arrayBuffer(), file);
  } finally {
    delete (globalThis as any).location;
    if (original) Object.defineProperty(globalThis, "caches", original);
    else delete (globalThis as any).caches;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("download deadline resets on real progress; user cancellation and bad SHA never cache", async () => {
  const data = Buffer.from("abcdefgh");
  const file = { path: "model.onnx", bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex") };
  const models = [{ id: "asr", files: [file] }] as Model[];
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  const saved = new Map<string, Response>();
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async () => ({
    match: async (url: string) => saved.get(url)?.clone(),
    delete: async (url: string) => saved.delete(url),
    put: async (url: string, response: Response) => { saved.set(url, response.clone()); },
  }) } });
  const server = createServer((_request, response) => {
    let sent = 0;
    const timer = setInterval(() => {
      response.write(data.subarray(sent, sent + 1));
      sent++;
      if (sent === data.length) { clearInterval(timer); response.end(); }
    }, 60);
    response.on("close", () => clearInterval(timer));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: new URL(base).origin } });
  try {
    // Transfer takes ~480 ms, longer than 250 ms, but each chunk makes progress.
    await prepareModels(base, models, new AbortController().signal, () => {}, 250);
    assert.equal(saved.size, 1);
    saved.clear();
    const cancel = new AbortController();
    await assert.rejects(prepareModels(base, models, cancel.signal,
      () => cancel.abort(new Error("user cancelled")), 250), /user cancelled/);
    assert.equal(saved.size, 0);
    const corrupt = [{ ...models[0], files: [{ ...file, sha256: "0".repeat(64) }] }];
    await assert.rejects(prepareModels(base, corrupt, new AbortController().signal,
      () => {}, 250), /Nieprawidłowy plik/);
    assert.equal(saved.size, 0);
  } finally {
    delete (globalThis as any).location;
    if (original) Object.defineProperty(globalThis, "caches", original);
    else delete (globalThis as any).caches;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("installation rejects foreign origin/userinfo/noncanonical base and path escapes", () => {
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "https://example.test" } });
  try {
    const base = "https://example.test/translator-test/";
    assert.equal(installationBase(base).href, base);
    for (const bad of ["https://other.test/translator-test/", "https://name:secret@example.test/translator-test/",
      "https://example.test/translator-test", base + "?x=1", base + "#x", base + "../", "https://example.test/%74ranslator-test/"])
      assert.throws(() => installationBase(bad), /baza/);
    const file = { path: "onnx/model.onnx", bytes: 1, sha256: "0".repeat(64) };
    const model = { id: "asr", files: [file] } as Model;
    assert.equal(artifactUrl(base, model, file), base + "models/asr/onnx/model.onnx");
    for (const path of ["../escape", "/escape", "//other.test/file", "a/../../file", "%2e%2e/file", "a\\file", "a//b", "a/./b", "a?x", "a#x", "https://other.test/file"])
      assert.throws(() => artifactUrl(base, model, { ...file, path }), /ścieżka/);
    assert.throws(() => artifactUrl(base, { ...model, id: "../escape" }, file), /ścieżka/);
    assert.notEqual(modelCacheName(base), modelCacheName("https://example.test/other/"));
    assert.notEqual(cacheNamesForPath("/").shellPrefix, cacheNamesForPath("/translator-test/").shellPrefix);
  } finally { delete (globalThis as any).location; }
});

test("model fetch uses same-origin credentials and denies HTTP redirects before the target", async () => {
  let targetHits = 0;
  const server = createServer((request, response) => {
    if (request.url === "/translator-test/models/asr/model.onnx") {
      response.writeHead(302, { Location: "/outside" }); response.end();
    } else { targetHits++; response.end("must not be requested"); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/translator-test/`;
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: new URL(base).origin } });
  const oldCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
  let puts = 0;
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async () => ({
    match: async () => undefined, put: async () => { puts++; },
  }) } });
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options?.credentials, "same-origin");
    assert.equal(options?.redirect, "error");
    return nativeFetch(url, options);
  };
  try {
    const file = { path: "model.onnx", bytes: 1, sha256: "0".repeat(64) };
    await assert.rejects(prepareModels(base, [{ id: "asr", files: [file] }] as Model[],
      new AbortController().signal, () => {}, 1000), /fetch failed/);
    assert.equal(targetHits, 0); assert.equal(puts, 0);
    await assert.rejects(prepareModels(base, [{ id: "asr", files: [{ ...file, path: "../escape" }] }] as Model[],
      new AbortController().signal, () => {}), /ścieżka/);
  } finally {
    globalThis.fetch = nativeFetch;
    delete (globalThis as any).location;
    if (oldCaches) Object.defineProperty(globalThis, "caches", oldCaches); else delete (globalThis as any).caches;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
