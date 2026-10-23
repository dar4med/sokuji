import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conversationModels,
  localVoice,
  microphoneError,
  route,
  RunToken,
  validateManifest,
  type Model,
} from "../src/core.ts";

const model = (
  id: string,
  source: Model["source"],
  target: Model["target"],
): Model => ({
  id,
  source,
  target,
  repo: "test/model",
  revision: "a".repeat(40),
  license: "apache-2.0",
  base: "test/base",
  prefix: "",
  files: [{ path: "config.json", bytes: 1, sha256: "b".repeat(64) }],
});
const models = [
  model("asr", null, null),
  model("pl-en", "pl", "en"),
  model("en-pl", "en", "pl"),
  model("nl-en", "nl", "en"),
  model("en-nl", "en", "nl"),
];
test("all six directions use the correct direct or pivot models", () => {
  const expected = {
    "pl-nl": ["pl-en", "en-nl"],
    "nl-pl": ["nl-en", "en-pl"],
    "pl-en": ["pl-en"],
    "en-pl": ["en-pl"],
    "nl-en": ["nl-en"],
    "en-nl": ["en-nl"],
  };
  for (const [pair, ids] of Object.entries(expected)) {
    const [from, to] = pair.split("-") as [
      "pl" | "en" | "nl",
      "pl" | "en" | "nl",
    ];
    assert.deepEqual(
      route(from, to, models).map((m) => m.id),
      ids,
    );
  }
});
test("missing direction fails instead of returning a simulated translation", () => {
  assert.throws(
    () =>
      route(
        "nl",
        "pl",
        models.filter((m) => m.id !== "en-pl"),
      ),
    /Brak zweryfikowanego/,
  );
});
test("only models required by the selected pair are included, ASR once", () => {
  assert.deepEqual(
    conversationModels("en", "nl", models).map((m) => m.id),
    ["asr", "en-nl", "nl-en"],
  );
  assert.equal(conversationModels("pl", "nl", models).length, 5);
});
test("invalid and path-traversing manifest artifacts are rejected", () => {
  assert.throws(() =>
    validateManifest({
      version: 1,
      models: [
        {
          ...models[0],
          files: [{ path: "../evil", bytes: 1, sha256: "b".repeat(64) }],
        },
      ],
    }),
  );
  assert.throws(() =>
    validateManifest({
      version: 1,
      models: [{ ...models[0], license: "cc-by-nc-4.0" }],
    }),
  );
  assert.equal(validateManifest({ version: 1, models }).models.length, 5);
});
test("cloud voices are never selected, including a matching default voice", () => {
  const voices = [
    { lang: "pl-PL", localService: false },
    { lang: "en-GB", localService: true },
  ];
  assert.equal(localVoice(voices, "pl"), undefined);
  assert.equal(localVoice(voices, "en"), voices[1]);
});
test("microphone permission, missing and busy errors have actionable messages", () => {
  assert.match(microphoneError({ name: "NotAllowedError" }), /zgody/);
  assert.match(microphoneError({ name: "NotFoundError" }), /Nie znaleziono/);
  assert.match(microphoneError({ name: "NotReadableError" }), /zajęty/);
});
test("old async work is invalidated on stop/restart", () => {
  const token = new RunToken();
  const first = token.next();
  token.next();
  assert.equal(token.valid(first), false);
});
