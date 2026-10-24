import { readFile } from "node:fs/promises";

/** Test-only controllable microphone. Permission is checked by native getUserMedia.
 * Native fake capture is muted and mixed with a one-shot WAV into a real WebAudio
 * MediaStream. Production capture/VAD/Whisper/MT are unchanged; no fake transcripts.
 * Unlike Chromium's file capture, the source clock starts only after VAD is ready.
 */
export async function installAudioFixture(page, filename) {
  const wav = (await readFile(filename)).toString("base64");
  await page.addInitScript(async (encoded) => {
    const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let calls = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const microphone = await native(constraints);
      calls++;
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      const muted = context.createGain();
      muted.gain.value = 0;
      const input = context.createMediaStreamSource(microphone);
      input.connect(muted).connect(destination);
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const buffer = await context.decodeAudioData(bytes.buffer);
      await context.resume();
      const track = destination.stream.getAudioTracks()[0];
      let source;
      const state = {
        nativeCalls: calls, playCount: 0, stream: destination.stream,
        stopped: false, context, microphone,
        play() {
          if (document.querySelector("#status").dataset.phase !== "listening" ||
              !track.enabled || track.readyState !== "live" || context.state !== "running")
            throw new Error("Fixture cannot play before VAD/microphone readiness");
          if (state.playCount) throw new Error("Fixture is one-shot, never a looping file");
          source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(destination);
          state.playCount++;
          state.playedAt = performance.now();
          source.start();
          return { nativeCalls: calls, playedAt: state.playedAt, duration: buffer.duration,
            phaseAtPlay: "listening", trackEnabled: track.enabled, contextState: context.state };
        },
      };
      const stop = track.stop.bind(track);
      track.stop = () => {
        if (state.stopped) return;
        state.stopped = true;
        source?.stop();
        input.disconnect();
        muted.disconnect();
        for (const original of microphone.getTracks()) original.stop();
        stop();
        void context.close();
      };
      window.__qaAudio = state;
      return destination.stream;
    };
  }, wav);
}
