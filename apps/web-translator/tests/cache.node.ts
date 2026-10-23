import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyArtifact } from "../src/cache.ts";

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
