import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { env, AutoTokenizer } from "@huggingface/transformers";

test("derived EN→PL tokenizer matches original SentencePiece fixture IDs", async () => {
  env.allowRemoteModels = false;
  env.localModelPath = new URL("../public/models/", import.meta.url).pathname;
  const tokenizer = await AutoTokenizer.from_pretrained("en-pl");
  const fixtures = JSON.parse(
    readFileSync(new URL("tokenizer-fixtures.json", import.meta.url), "utf8"),
  ) as { text: string; ids: number[] }[];
  assert.ok(fixtures.length >= 4);
  for (const fixture of fixtures)
    assert.deepEqual(tokenizer.encode(fixture.text), fixture.ids, fixture.text);
});
