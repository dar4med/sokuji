import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Conversation,
  type Entry,
  type Phase,
  type Resources,
} from "../src/session.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture(overrides: Partial<Resources> = {}) {
  const events: string[] = [],
    warnings: string[] = [],
    rows: Entry[] = [],
    states: Phase[] = [];
  const resources: Resources = {
    recognize: async () => {
      events.push("asr");
      return { text: "fictional input", ms: 5 };
    },
    translate: async (_text, from, to) => {
      events.push(`mt:${from}-${to}`);
      return { text: "fixture output", ms: 8 };
    },
    speak: async () => {
      events.push("tts");
      return null;
    },
    pause: async () => {
      events.push("pause");
    },
    resume: async () => {
      events.push("resume");
    },
    close: async () => {
      events.push("close");
    },
    ...overrides,
  };
  const conversation = new Conversation({
    prepare: async () => resources,
    state: (p) => states.push(p),
    entry: (e) => rows.push(e),
    warning: (message) => warnings.push(message),
  });
  return { conversation, resources, events, rows, states, warnings };
}
test("capture stays paused for the entire ASR → MT → TTS sequence", async () => {
  const f = fixture();
  await f.conversation.start();
  f.events.length = 0;
  await f.conversation.submit(new Float32Array(16000), "pl", "nl");
  assert.deepEqual(f.events, ["pause", "asr", "mt:pl-nl", "tts", "resume"]);
  assert.equal(f.rows[0].translated, "");
  assert.equal(f.rows[1].translated, "fixture output");
  await f.conversation.stop();
});
test("stop during ASR prevents late transcript, translation, TTS and microphone resume", async () => {
  const pending = deferred<{ text: string; ms: number }>();
  const f = fixture({ recognize: () => pending.promise });
  await f.conversation.start();
  const job = f.conversation.submit(new Float32Array(1), "en", "nl");
  await Promise.resolve();
  await f.conversation.stop();
  f.events.length = 0;
  pending.resolve({ text: "late", ms: 1 });
  await job;
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.rows, []);
});
test("overlapping utterances are ignored and next turn can reverse direction", async () => {
  const pending = deferred<{ text: string; ms: number }>();
  const f = fixture({ recognize: () => pending.promise });
  await f.conversation.start();
  const job = f.conversation.submit(new Float32Array(1), "pl", "nl");
  await f.conversation.submit("overlap", "nl", "pl");
  pending.resolve({ text: "first", ms: 1 });
  await job;
  await f.conversation.submit("second", "nl", "pl");
  assert.equal(f.rows.length, 4);
  assert.deepEqual(
    f.events.filter((e) => e.startsWith("mt:")),
    ["mt:pl-nl", "mt:nl-pl"],
  );
  await f.conversation.stop();
});
test("microphone preparation failure resets active state and permits retry", async () => {
  let calls = 0;
  const f = fixture();
  const session = new Conversation({
    prepare: async () => {
      if (++calls === 1) throw new Error("Brak zgody");
      return f.resources;
    },
    state: (p) => f.states.push(p),
    entry: () => {},
    warning: () => {},
  });
  await session.start();
  assert.equal(session.active, false);
  assert.equal(f.states.at(-1), "error");
  await session.start();
  assert.equal(session.active, true);
  await session.stop();
});
test("resources arriving after Stop are closed and never resumed", async () => {
  const pending = deferred<Resources>();
  const f = fixture();
  const session = new Conversation({
    prepare: () => pending.promise,
    state: () => {},
    entry: () => {},
    warning: () => {},
  });
  const starting = session.start();
  await session.stop();
  pending.resolve(f.resources);
  await starting;
  assert.deepEqual(f.events, ["close"]);
});

test("rejected ASR warns and resumes capture without creating a row, MT or TTS", async () => {
  const f = fixture({ recognize: async () => ({ text: "", ms: 1, warning: "Repeat the sentence" }) });
  await f.conversation.start();
  f.events.length = 0;
  await f.conversation.submit(new Float32Array(16000), "en", "nl");
  assert.deepEqual(f.events, ["pause", "resume"]);
  assert.deepEqual(f.rows, []);
  assert.deepEqual(f.warnings, ["Repeat the sentence"]);
  assert.equal(f.states.at(-1), "listening");
  await f.conversation.stop();
});
