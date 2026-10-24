import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speakLocal } from '../src/speech.ts';
import { Conversation, type Resources } from '../src/session.ts';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
test('local TTS keeps capture paused through end and echo tail; Stop cancels without resume', async () => {
  const oldWindow = (globalThis as any).window, oldUtterance = (globalThis as any).SpeechSynthesisUtterance;
  let utterance: any, cancels = 0;
  (globalThis as any).window = { speechSynthesis: {
    getVoices: () => [{ lang: 'pl-PL', localService: true }],
    cancel() { cancels++; }, speak(value: any) { utterance = value; },
  } };
  (globalThis as any).SpeechSynthesisUtterance = class { text: string; constructor(text: string) { this.text = text; } };
  const events: string[] = [];
  const resources: Resources = {
    recognize: async () => ({ text: 'Fikcyjny tekst.', ms: 1 }),
    translate: async () => ({ text: 'Fikcyjne tłumaczenie.', ms: 1 }), speak: speakLocal,
    pause: async () => { events.push('pause'); }, resume: async () => { events.push('resume'); },
    close: async () => { events.push('close'); },
  };
  const conversation = new Conversation({ prepare: async () => resources, state() {}, entry() {}, warning() {} });
  try {
    await conversation.start(); events.length = 0;
    const turn = conversation.submit('Fikcyjny tekst.', 'nl', 'pl');
    await wait(1); assert.deepEqual(events, ['pause']);
    assert.equal(utterance.voice.localService, true);
    utterance.onend(); await wait(100); assert.deepEqual(events, ['pause']);
    await turn; assert.deepEqual(events, ['pause', 'resume']);
    events.length = 0;
    const interrupted = conversation.submit('Druga fikcyjna próba.', 'nl', 'pl');
    await wait(1); await conversation.stop(); await interrupted;
    assert.deepEqual(events, ['pause', 'close']); assert.ok(cancels >= 3);
  } finally {
    await conversation.stop();
    (globalThis as any).window = oldWindow; (globalThis as any).SpeechSynthesisUtterance = oldUtterance;
  }
});
