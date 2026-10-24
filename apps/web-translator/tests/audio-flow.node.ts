import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SerialFrames, UtteranceWindow, VAD_TIMING } from '../src/audio-flow.ts';
const require = createRequire(import.meta.url);
const { FrameProcessor } = require('@ricky0123/vad-web/dist/frame-processor.js');
const { Resampler } = require('@ricky0123/vad-web/dist/resampler.js');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
test('exact deployed Worklet C() overlaps/reorders slow inference; serial wrapper fixes that boundary', async () => {
  const deployed = readFileSync(new URL('../delivery/local-ui-update/payload/assets/capture-Bh2ZntkC.js', import.meta.url), 'utf8');
  const from = deployed.indexOf('async function C(e,t,n,r,i){');
  const to = deployed.indexOf('async function w(', from);
  assert.ok(from >= 0 && to > from);
  const C = runInNewContext('(' + deployed.slice(from, to) + ')', {
    AudioWorkletNode: class { port: any = {}; }, console, Float32Array, ArrayBuffer,
    g: require('@ricky0123/vad-web/dist/messages.js'),
  });
  for (const serial of [false, true]) {
    let concurrent = 0, peak = 0;
    const order: number[] = [];
    const process = async (frame: Float32Array) => {
      const id = frame[0]; peak = Math.max(peak, ++concurrent);
      await sleep([150, 40, 50][id]); order.push(id); concurrent--;
    };
    const gate = new SerialFrames(process, message => assert.fail(message)); gate.start();
    const node = await C('fixture', {}, { audioWorklet: { addModule: async () => {} } }, 512,
      serial ? (frame: Float32Array) => gate.push(frame) : process);
    const jobs = [];
    for (let id = 0; id < 3; id++) {
      jobs.push(node.port.onmessage({ data: { message: 'AUDIO_FRAME', data: new Float32Array([id]).buffer } }));
      if (id < 2) await sleep(32);
    }
    await Promise.all(jobs);
    assert.equal(peak, serial ? 1 : 3);
    assert.deepEqual(order, serial ? [0, 1, 2] : [1, 2, 0]);
    await gate.pause();
  }
});
test('delayed VAD frames >32ms remain serial and finish in capture order', async () => {
  let active = 0, peak = 0;
  const starts: number[] = [], ends: number[] = [];
  const frames = new SerialFrames(async frame => {
    const id = frame[0]; starts.push(id); peak = Math.max(peak, ++active);
    await sleep([150, 40, 50][id]); ends.push(id); active--;
  }, message => assert.fail(message));
  frames.start();
  const jobs = [frames.push(new Float32Array([0]))];
  await sleep(32); jobs.push(frames.push(new Float32Array([1])));
  await sleep(32); jobs.push(frames.push(new Float32Array([2])));
  await Promise.all(jobs);
  assert.equal(peak, 1); assert.deepEqual(starts, [0, 1, 2]); assert.deepEqual(ends, [0, 1, 2]);
});
test('pause drains in-flight state, invalidates queued frames and cannot replay them after TTS', async () => {
  const entered: number[] = [], emitted: number[] = [];
  let paused = false;
  const frames = new SerialFrames(async frame => {
    entered.push(frame[0]); await sleep(50);
    // Capture callbacks have the same paused/destroyed guard.
    if (!paused) emitted.push(frame[0]);
  }, message => assert.fail(message));
  frames.start(); void frames.push(new Float32Array([0])); await sleep(1);
  void frames.push(new Float32Array([1])); void frames.push(new Float32Array([2]));
  paused = true; await frames.pause();
  assert.deepEqual(entered, [0]); assert.deepEqual(emitted, []);
  await frames.push(new Float32Array([3]));
  paused = false; frames.start(); await frames.push(new Float32Array([4]));
  assert.deepEqual(entered, [0, 4]); assert.deepEqual(emitted, [4]);
  await frames.pause();
});
test('actual frame processor delayed inference is drained before reset; no stale state/events after pause', async () => {
  let state = 0, paused = false;
  const emitted: string[] = [];
  const processor = new FrameProcessor(async () => {
    const before = state; await sleep(50); state = before + 1;
    return { isSpeech: .9, notSpeech: .1 };
  }, () => { state = 0; },
  { positiveSpeechThreshold: .55, negativeSpeechThreshold: .35, preSpeechPadMs: 800,
    redemptionMs: 1400, minSpeechMs: 300, submitUserSpeechOnPause: false }, 32);
  const event = (e: any) => { if (!paused) emitted.push(e.msg); };
  const frames = new SerialFrames(frame => processor.process(frame, event), message => assert.fail(message));
  processor.resume(); frames.start();
  void frames.push(new Float32Array(512)); await sleep(1);
  void frames.push(new Float32Array(512)); paused = true;
  await frames.pause(); processor.pause(event);
  assert.equal(state, 0); assert.deepEqual(emitted, []);
  assert.equal(processor.audioBuffer.length, 0);
  paused = false; processor.resume(); frames.start();
  await frames.push(new Float32Array(512)); assert.equal(state, 1);
  assert.equal(processor.audioBuffer.length, 1);
  await frames.pause(); processor.pause(event);
});
test('bounded backlog stops instead of dropping/reordering audio silently', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const warnings: string[] = [], seen: number[] = [];
  const frames = new SerialFrames(async frame => { seen.push(frame[0]); await gate; }, message => warnings.push(message), 2);
  frames.start(); void frames.push(new Float32Array([0])); await Promise.resolve();
  void frames.push(new Float32Array([1])); await frames.push(new Float32Array([2]));
  release(); await frames.pause();
  assert.deepEqual(seen, [0]); assert.equal(warnings.length, 1); assert.match(warnings[0], /nie nadąża/);
});
test('hard limit preserves exact bounded prefix with pre-roll, once, instead of dropping the turn', () => {
  const window = new UtteranceWindow();
  for (let i = 0; i < 30; i++) window.push(new Float32Array(512).fill(i));
  window.begin();
  let result: Float32Array | null = null;
  for (let i = 30; !result; i++) result = window.push(new Float32Array(512).fill(i));
  assert.equal(result.length, 320000); assert.equal(result[0], 5); assert.equal(result[511], 5);
  assert.equal(result[512], 6); assert.equal(result[319999], 629);
  assert.equal(window.push(new Float32Array(512)), null);
  window.reset(); window.begin(); assert.equal(window.push(new Float32Array(512)), null);
});
async function segments(redemptionMs: number) {
  const events: any[] = [];
  const processor = new FrameProcessor(async (frame: Float32Array) => ({ isSpeech: frame[0], notSpeech: 1 - frame[0] }), () => {},
    { positiveSpeechThreshold: .55, negativeSpeechThreshold: .35, preSpeechPadMs: VAD_TIMING.preSpeechPadMs,
      redemptionMs, minSpeechMs: 300, submitUserSpeechOnPause: false }, 32);
  processor.resume();
  for (const [probability, count] of [[0, 25], [.9, 40], [0, 30], [.9, 40], [0, 50]])
    for (let i = 0; i < count; i++) await processor.process(new Float32Array(512).fill(probability), (event: any) => events.push(event));
  return events.filter(event => event.audio).map(event => event.audio.length);
}
test('actual VAD frame processor keeps a 960ms internal pause in one turn; old750ms split it', async () => {
  assert.equal((await segments(750)).length, 2);
  assert.equal((await segments(VAD_TIMING.redemptionMs)).length, 1);
});
test('actual VAD resampler returns finite ordered 16kHz frames from48kHz and44.1kHz', () => {
  for (const rate of [48000, 44100]) {
    const sampler = new Resampler({ nativeSampleRate: rate, targetSampleRate: 16000, targetFrameSize: 512 });
    const input = Float32Array.from({ length: rate }, (_, i) => Math.sin(i * 2 * Math.PI * 440 / rate));
    const output: Float32Array[] = [];
    for (let i = 0; i < input.length; i += 128) output.push(...sampler.process(input.subarray(i, i + 128)));
    assert.equal(output.length, 31);
    const flat = Float32Array.from(output.flatMap(frame => [...frame]));
    assert.ok(flat.every(Number.isFinite));
    let crossings = 0;
    for (let i = 1; i < flat.length; i++) if (flat[i - 1] <= 0 && flat[i] > 0) crossings++;
    assert.ok(Math.abs(crossings / (flat.length / 16000) - 440) < 3);
  }
});
