import { MicVAD } from "@ricky0123/vad-web";
import { SerialFrames, UtteranceWindow, VAD_TIMING } from "./audio-flow.ts";

export async function createCapture(
  base: string,
  stream: MediaStream,
  context: AudioContext,
  callbacks: {
    start(): void;
    end(audio: Float32Array): void;
    misfire(): void;
    limit(): void;
    failure(message: string): void;
  },
) {
  const utterance = new UtteranceWindow();
  let destroyed = false;
  let faulted = false;
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
    redemptionMs: VAD_TIMING.redemptionMs,
    preSpeechPadMs: VAD_TIMING.preSpeechPadMs,
    minSpeechMs: 300,
    submitUserSpeechOnPause: false,
    onSpeechStart() {
      if (paused || destroyed) return;
      utterance.begin();
      callbacks.start();
    },
    onVADMisfire() {
      if (paused || destroyed) return;
      utterance.reset();
      callbacks.misfire();
    },
    onSpeechEnd(audio) {
      utterance.reset();
      if (!paused && !destroyed) callbacks.end(audio);
    },
    onFrameProcessed(_probability, frame) {
      if (paused || destroyed) return;
      const prefix = utterance.push(frame);
      if (!prefix) return;
      // Do not resume here: ASR/MT/TTS owns the pause until the next turn.
      void pauseCapture().then(() => {
        if (destroyed) return;
        callbacks.limit();
        callbacks.end(prefix);
      }).catch(() => fail("Nie udało się wstrzymać mikrofonu."));
    },
  });
  const fail = (message: string) => {
    if (destroyed || faulted) return;
    faulted = true;
    paused = true;
    for (const track of stream.getAudioTracks()) track.enabled = false;
    callbacks.failure(message);
  };
  const processFrame = vad.processFrame;
  const frames = new SerialFrames(frame => processFrame(frame), fail);
  vad.processFrame = frame => frames.push(frame);
  async function pauseCapture() {
    paused = true;
    for (const track of stream.getAudioTracks()) track.enabled = false;
    await frames.pause();
    if (!destroyed) await vad.pause();
    utterance.reset();
  }
  await vad.pause();
  return {
    async start() {
      if (destroyed || faulted) return;
      paused = false;
      frames.start();
      for (const track of stream.getAudioTracks()) track.enabled = true;
      await vad.start();
    },
    pause: pauseCapture,
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      paused = true;
      for (const track of stream.getAudioTracks()) track.enabled = false;
      await frames.pause();
      utterance.reset();
      await vad.destroy();
    },
  };
}
