import { test } from "node:test";
import assert from "node:assert/strict";
import { RawImage } from "@huggingface/transformers";
import sharp from "sharp";

// This is a dependency compatibility check, not an image feature of the app.
// Only generated RGB/RGBA pixels are decoded: never untrusted image fixtures.
test("scoped sharp override preserves Transformers Node decode/resize on RGB and RGBA", async () => {
  for (const channels of [3, 4] as const) {
    const encoded = await sharp({ create: {
      width: 2, height: 2, channels,
      background: { r: 5, g: 10, b: 15, alpha: 1 },
    } }).png().toBuffer();
    const image = await RawImage.fromBlob(new Blob([encoded], { type: "image/png" }));
    assert.equal(image.width, 2);
    assert.equal(image.height, 2);
    assert.equal(image.channels, channels);
    const resized = await image.resize(1, 1);
    assert.equal(resized.width, 1);
    assert.equal(resized.height, 1);
    assert.deepEqual(Array.from(resized.data), channels === 3 ? [5, 10, 15] : [5, 10, 15, 255]);
  }
});
