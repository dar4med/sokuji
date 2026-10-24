import { MicVAD } from "@ricky0123/vad-web";

export async function createCapture(
  base: string,
  stream: MediaStream,
  context: AudioContext,
  callbacks: {
    start(): void;
    end(audio: Float32Array): void;
    misfire(): void;
    limit(): void;
  },
) {
  let speechFrames = 0;
  let speaking = false;
  let limited = false;
  let destroyed = false;
  let paused = true;
  let vad: MicVAD;
  vad = await MicVAD.new({
    model: "v5",
    startOnLoad: false,
    audioContext: context,
    baseAssetPath: new URL("vad/", base).href,
    onnxWASMBasePath: new URL("runtime/", base).href,
    ortConfig(ort) {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.logLevel = "error";
    },
    getStream: async () => stream,
    pauseStream: async () => {
      for (const track of stream.getAudioTracks()) track.enabled = false;
    },
    resumeStream: async () => {
      for (const track of stream.getAudioTracks()) track.enabled = true;
      return stream;
    },
    positiveSpeechThreshold: 0.55,
    negativeSpeechThreshold: 0.35,
    redemptionMs: 750,
    preSpeechPadMs: 300,
    minSpeechMs: 300,
    submitUserSpeechOnPause: false,
    onSpeechStart() {
      if (paused || destroyed) return;
      speaking = true;
      speechFrames = 0;
      limited = false;
      callbacks.start();
    },
    onVADMisfire() {
      if (paused || destroyed) return;
      speaking = false;
      callbacks.misfire();
    },
    onSpeechEnd(audio) {
      speaking = false;
      if (!limited && !paused && !destroyed) callbacks.end(audio);
    },
    onFrameProcessed(_probability, frame) {
      if (speaking && !limited && !paused && !destroyed) {
        speechFrames += frame.length;
        if (speechFrames > 20 * 16000) {
          limited = true;
          speaking = false;
          // Keep a strict utterance bound even when a speaker never pauses.
          void vad
            .pause()
            .then(() => {
              if (destroyed) return;
              callbacks.limit();
              return vad.start();
            })
            .catch(() => {
              if (!destroyed) callbacks.limit();
            });
        }
      }
    },
  });
  await vad.pause();
  return {
    async start() {
      if (destroyed) return;
      paused = false;
      for (const track of stream.getAudioTracks()) track.enabled = true;
      await vad.start();
    },
    async pause() {
      paused = true;
      for (const track of stream.getAudioTracks()) track.enabled = false;
      if (!destroyed) await vad.pause();
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      paused = true;
      await vad.destroy();
    },
  };
}
