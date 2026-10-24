// Conservative rejection, never rewriting a transcript or stripping negations.
// This is not a general music/noise classifier; VAD remains the speech detector.
export function audibleAudio(audio: Float32Array): boolean {
  if (audio.length < 0.3 * 16000) return false;
  let energy = 0;
  for (const sample of audio) {
    if (!Number.isFinite(sample)) return false;
    energy += sample * sample;
  }
  return Math.sqrt(energy / audio.length) >= 0.001; // Below -60 dBFS: ask to repeat.
}

export function repeatedTranscript(text: string): boolean {
  const words = text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length < 12) return false;
  for (let size = 1; size <= Math.min(8, Math.floor(words.length / 3)); size++) {
    for (let start = 0; start + size * 3 <= words.length; start++) {
      let end = start + size;
      while (end < words.length && words[end] === words[start + (end - start) % size]) end++;
      const repeats = Math.floor((end - start) / size);
      if (repeats >= (size === 1 ? 8 : 3) && repeats * size >= words.length * 0.8) return true;
    }
  }
  return false;
}
