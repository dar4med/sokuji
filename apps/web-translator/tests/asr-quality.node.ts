import { test } from "node:test";
import assert from "node:assert/strict";
import { audibleAudio, repeatedTranscript } from "../src/asr-quality.ts";

test("silence, near silence, short and invalid samples never reach ASR", () => {
  for (const audio of [new Float32Array(16000), new Float32Array(16000).fill(0.00001),
    new Float32Array(100).fill(0.1), new Float32Array(16000).fill(NaN)])
    assert.equal(audibleAudio(audio), false);
  assert.equal(audibleAudio(new Float32Array(16000).fill(0.01)), true);
});
test("only extreme repeated runs are rejected, without modifying useful repetition or numbers", () => {
  assert.equal(repeatedTranscript("Thank you for watching. ".repeat(6)), true);
  assert.equal(repeatedTranscript("hello ".repeat(16)), true);
  for (const text of ["Nie, nie biorę 5 mg. Biorę 10 mg dwa razy dziennie.",
    "Nee, ik neem geen 5 mg. Ik neem 10 mg tweemaal per dag.",
    "No, I do not take 5 mg. I take 10 mg twice a day.",
    "Nie nie nie.", "The blue bicycle is next to the house."])
    assert.equal(repeatedTranscript(text), false, text);
});
