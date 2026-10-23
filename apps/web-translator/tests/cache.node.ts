import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareModels, verifyArtifact } from "../src/cache.ts";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
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
    if (original) Object.defineProperty(globalThis, "caches", original);
    else delete (globalThis as any).caches;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
