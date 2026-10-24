// One common offline VAD baseline for both ASR models. No physical microphone.
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const folder = process.env.NATURAL_ASR_DIR || '/workspace/artifacts/natural-asr';
const corpus = JSON.parse(await readFile(path.join(folder, 'CORPUS.json')));
let capture = await readFile(path.join(root, 'delivery/hf-static/audio-update/capture-Bh2ZntkC.js'), 'utf8');
assert.equal(createHash('sha256').update(capture).digest('hex'), '254338e99c1e2256f3a088e364167cac5d8333e391242a268df09fa00f0af8c2');
const [namespace] = [...capture.matchAll(/([A-Za-z_$][\w$]*)\.MicVAD\.new\(\{model:/g)].map(match => match[1]);
assert.ok(namespace);
capture += `\nexport const qaVAD=${namespace}.MicVAD;\n`;
const pathsHelper = await readFile(path.join(root, 'delivery/hf-static/worker-runtime/hf-wasm-paths.js'), 'utf8');
const fixtures = new Map(corpus.samples.map(sample => ['/' + sample.pcmFile, sample]));
const results = [];
const report = { corpusSha256: corpus.corpusSha256, runtime: 'Existing ORT1.22.0/SileroV5, WASM threads1, proxyfalse',
  config: { positiveSpeechThreshold: .55, negativeSpeechThreshold: .35, redemptionMs: 1400, preSpeechPadMs: 800, minSpeechMs: 300, submitUserSpeechOnPause: false },
  method: 'Actual MicVAD frameProcessor/processFrame; sequential offline512-sample input, final zero padding of1600ms. No WebAudio, capture/device timing, half-duplex loss, ASR or TTS simulated. This isolates segmentation; identical stored output used by both ASR models.', samples: results };
await mkdir(path.join(folder, 'segments'), { recursive: true });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const write = url.pathname.match(/^\/segment\/(pl|nl)-(\d+)\/(\d+)$/);
  if (req.method === 'POST' && write) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 2000000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
    const bytes = Buffer.concat(chunks); const file = `segments/${write[1]}-${write[2]}-${write[3]}.f32`;
    await writeFile(path.join(folder, file), bytes);
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ file, bytes: bytes.length, samples: bytes.length / 4, sha256: createHash('sha256').update(bytes).digest('hex') })); return;
  }
  try {
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; connect-src 'self' blob:"); res.end('<!doctype html><meta charset="utf-8"><title>Offline common VAD</title>'); return; }
    if (url.pathname === '/capture.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(capture); return; }
    if (url.pathname === '/paths.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(pathsHelper + '\nwindow.qaPaths=hfWasmPaths;'); return; }
    let file;
    if (fixtures.has(url.pathname)) file = path.join(folder, fixtures.get(url.pathname).pcmFile);
    else if (/^\/(runtime|vad)\/[A-Za-z0-9_.-]+$/.test(url.pathname)) file = path.join(root, 'public', url.pathname);
    else { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.mjs') || file.endsWith('.js') ? 'application/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(); await page.goto(origin); await page.addScriptTag({ url: origin + '/paths.js' });
  for (const fixture of corpus.samples) {
    const result = await page.evaluate(async fixture => {
      const { qaVAD } = await import('/capture.js');
      const wasmPaths = await window.qaPaths(location.origin + '/');
      const segments = [];
      const vad = await qaVAD.new({ model: 'v5', startOnLoad: false, baseAssetPath: location.origin + '/vad/',
        onnxWASMBasePath: wasmPaths, ortConfig(ort) { ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.logLevel = 'error'; },
        positiveSpeechThreshold: .55, negativeSpeechThreshold: .35, redemptionMs: 1400, preSpeechPadMs: 800, minSpeechMs: 300,
        submitUserSpeechOnPause: false, onSpeechEnd(audio) { segments.push(audio); } });
      if (!vad.frameProcessor || !vad.model) throw Error('QA requires the pinned MicVAD frameProcessor/model');
      const samples = new Float32Array(await (await fetch('/' + fixture.pcmFile)).arrayBuffer());
      const input = new Float32Array(Math.ceil(samples.length / 512) * 512 + 50 * 512); input.set(samples);
      vad.frameProcessor.resume();
      for (let offset = 0; offset < input.length; offset += 512) await vad.processFrame(input.subarray(offset, offset + 512));
      vad.frameProcessor.pause(vad.handleFrameProcessorEvent);
      const files = [];
      for (const [index, audio] of segments.entries()) {
        if (audio.length > 320000) throw Error('VAD baseline exceeded production20s window');
        const response = await fetch(`/segment/${fixture.languageCode}-${fixture.id}/${index}`, { method: 'POST', body: audio.buffer });
        if (!response.ok) throw Error('Unable to store local VAD segment'); files.push(await response.json());
      }
      await vad.model.release();
      return { language: fixture.languageCode, id: fixture.id, originalSamples: samples.length, segments: files };
    }, fixture);
    results.push(result); console.log(JSON.stringify({ language: result.language, id: result.id, segments: result.segments.map(segment => segment.samples / 16000) }));
  }
  await writeFile(path.join(folder, 'VAD-SEGMENTS.json'), JSON.stringify(report, null, 2) + '\n');
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
