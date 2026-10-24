// VAD frames are 512 samples / 32 ms at 16 kHz. Never run stateful Silero twice.
export class SerialFrames {
  private epoch = 0;
  private active = false;
  private pending = 0;
  private tail: Promise<void> = Promise.resolve();
  private process: (frame: Float32Array) => Promise<void>;
  private failed: (message: string) => void;
  private maxPending: number;
  constructor(process: (frame: Float32Array) => Promise<void>,
    failed: (message: string) => void, maxPending = 64) {
    this.process = process; this.failed = failed; this.maxPending = maxPending;
  }
  start() { this.epoch++; this.active = true; }
  push(frame: Float32Array): Promise<void> {
    if (!this.active) return Promise.resolve();
    if (this.pending >= this.maxPending) {
      this.active = false; this.epoch++;
      this.failed("Urządzenie nie nadąża z analizą mikrofonu. Rozmowa została zatrzymana; nie rozpoznajemy niepełnego audio. Zamknij inne karty i spróbuj ponownie.");
      return Promise.resolve();
    }
    const epoch = this.epoch;
    this.pending++;
    this.tail = this.tail.then(async () => {
      if (this.active && epoch === this.epoch) await this.process(frame);
    }).catch(() => {
      if (this.active && epoch === this.epoch) {
        this.active = false; this.epoch++;
        this.failed("Analiza mikrofonu została przerwana. Rozpocznij rozmowę ponownie.");
      }
    }).finally(() => { this.pending--; });
    return this.tail;
  }
  async pause() {
    this.active = false; this.epoch++;
    // Drain the in-flight inference before MicVAD resets its recurrent state.
    await this.tail;
  }
}

export const VAD_TIMING = { redemptionMs: 1400, preSpeechPadMs: 800, maxSamples: 20 * 16000 };

/** Retain a bounded prefix on the hard limit instead of discarding the whole turn. */
export class UtteranceWindow {
  private recent: Float32Array[] = [];
  private frames: Float32Array[] = [];
  private samples = 0;
  private speaking = false;
  begin() {
    this.speaking = true;
    this.frames = this.recent;
    this.samples = this.frames.reduce((sum, frame) => sum + frame.length, 0);
    this.recent = [];
  }
  reset() { this.speaking = false; this.recent = []; this.frames = []; this.samples = 0; }
  push(frame: Float32Array): Float32Array | null {
    const copy = frame.slice();
    if (!this.speaking) {
      this.recent.push(copy);
      while (this.recent.length > Math.floor(VAD_TIMING.preSpeechPadMs / 32)) this.recent.shift();
      return null;
    }
    this.frames.push(copy); this.samples += copy.length;
    if (this.samples < VAD_TIMING.maxSamples) return null;
    const audio = new Float32Array(VAD_TIMING.maxSamples);
    let offset = 0;
    for (const part of this.frames) {
      const count = Math.min(part.length, audio.length - offset);
      audio.set(part.subarray(0, count), offset); offset += count;
      if (offset === audio.length) break;
    }
    this.reset();
    return audio;
  }
}
