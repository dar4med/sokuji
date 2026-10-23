import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { serviceWorkerSource } from "../src/service-worker.ts";

test("SW guard rejects POST, foreign origin and out-of-scope navigation before respondWith", () => {
  const handlers: Record<string, Function> = {};
  runInNewContext(serviceWorkerSource("test", ["index.html"]), {
    URL, encodeURIComponent,
    self: { location: new URL("https://example.test/translator-test/sw.js"),
      addEventListener: (type: string, fn: Function) => { handlers[type] = fn; } },
    caches: { match: async () => undefined },
    fetch: async () => new Response("network"),
  });
  for (const [method, url] of [["POST", "https://example.test/translator-test/"],
    ["GET", "https://other.test/translator-test/"], ["GET", "https://example.test/wordpress/"],
    ["GET", "https://example.test/translator-test-evil/"]]) {
    let handled = false;
    handlers.fetch({ request: { method, url, mode: "navigate" }, respondWith: () => { handled = true; } });
    assert.equal(handled, false, url);
  }
  let handled = false;
  handlers.fetch({ request: { method: "GET", url: "https://example.test/translator-test/", mode: "navigate" },
    respondWith: () => { handled = true; } });
  assert.equal(handled, true);
});
