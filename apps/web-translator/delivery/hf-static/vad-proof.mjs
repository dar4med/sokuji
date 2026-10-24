// Local intercepted HTTPS origin: no HF connection, new model or physical microphone.
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('../../', import.meta.url);
const origin = 'https://dar4med-med-partners-translator-test.static.hf.space';
const original = await readFile(new URL('delivery/local-ui-update/payload/assets/capture-Bh2ZntkC.js', root));
const patched = await readFile(new URL('./capture-Bh2ZntkC.js', import.meta.url));
const adapter = await readFile(new URL('./hf-session-adapter.js', import.meta.url));
const pinned = JSON.parse(await readFile(new URL('delivery/local-ui-update/update-manifest.json', root)));
const resources = new Map();
for (const path of ['runtime/ort-wasm-simd-threaded.mjs', 'runtime/ort-wasm-simd-threaded.wasm',
  'vad/silero_vad_v5.onnx', 'vad/vad.worklet.bundle.min.js']) {
  const bytes = await readFile(new URL('public/' + path, root));
  assert.equal(bytes.length, pinned.baseFiles[path].bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pinned.baseFiles[path].sha256);
  resources.set('/' + path, bytes);
}
let mjsImports = 0, mjsFetches = 0, wasmFetches = 0, vadFetches = 0, allowBlob = true;
const external = [];
let localOrigin;
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/index.html') {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' " + (allowBlob ? 'blob: ' : '') + "'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:");
    res.end('<!doctype html><meta charset="UTF-8"><title>Local VAD readiness proof</title>'); return;
  }
  // Only the exact host literal is substituted in these local fixtures. The
  // scope/signature logic is separately tested against the real HF origin.
  if (path === '/hf-session-adapter.js' || path === '/patched.js' || path === '/baseline.js') {
    res.setHeader('Content-Type', 'application/javascript');
    const body = path === '/hf-session-adapter.js' ? adapter : path === '/patched.js' ? patched : original;
    res.end(body.toString().replaceAll(origin, localOrigin)); return;
  }
  if (path.endsWith('.mjs')) {
    if (req.headers['sec-fetch-dest'] === 'script') { mjsImports++; res.writeHead(403); res.end('Intentional module import refusal'); return; }
    mjsFetches++;
  }
  if (path.endsWith('.wasm')) wasmFetches++;
  if (path === '/vad/silero_vad_v5.onnx') vadFetches++;
  if (!resources.has(path)) { res.writeHead(404); res.end('Not part of proof'); return; }
  res.setHeader('Content-Type', path.endsWith('.mjs') || path.endsWith('.js') ? 'application/javascript' : path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
  res.end(resources.get(path));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
localOrigin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext();
const page = await context.newPage();
context.on('request', req => {
  const url = req.url();
  if (!url.startsWith(localOrigin + '/') && !url.startsWith('blob:') && !url.startsWith('data:')) external.push(new URL(url).origin);
});
async function trial(filename) {
  await page.goto(localOrigin + '/index.html?__sign=fictional-local-only');
  await page.addScriptTag({ url: localOrigin + '/hf-session-adapter.js' });
  return page.evaluate(async filename => {
    const context = new AudioContext({ sampleRate: 16000 });
    const stream = context.createMediaStreamDestination().stream;
    let capture;
    let speech = 0;
    try {
      const module = await import('/' + filename);
      capture = await module.createCapture(location.origin + '/', stream, context,
        { start() { speech++; }, end() { speech++; }, misfire() {}, limit() {} });
      await capture.start(); await capture.pause();
      return { ok: true, speechCallbacks: speech, physicalMicrophone: false, isolated: crossOriginIsolated };
    } catch (error) { return { ok: false, error: error.message, physicalMicrophone: false }; }
    finally {
      try { await capture?.destroy(); } catch { /* A failed start can leave no audio adapter; preserve its original error. */ }
      stream.getTracks().forEach(track => track.stop()); await context.close();
    }
  }, filename);
}
try {
  const baseline = await trial('baseline.js');
  assert.equal(baseline.ok, false); assert.match(baseline.error, /dynamically imported module/); assert.equal(mjsImports, 1);
  mjsFetches = wasmFetches = vadFetches = 0;
  const result = await trial('patched.js');
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.speechCallbacks, 0);
  assert.equal(mjsFetches, 1); assert.equal(wasmFetches, 1); assert.equal(vadFetches, 1); assert.deepEqual(external, []);
  const readyCounts = { mjsFetches, wasmFetches, vadFetches };
  allowBlob = false; wasmFetches = 0;
  const blocked = await trial('patched.js');
  assert.equal(blocked.ok, false); assert.match(blocked.error, /blob.*CSP/); assert.equal(wasmFetches, 0);
  const evidence = { passed: true, baseline, patched: result, ...readyCounts, mainCspWithoutBlob: blocked, externalRequests: external,
    source: 'Actual VAD/ORT initialization/start/pause with locally pinned files and silent generated MediaStream; only HF host literal replaced with localhost fixture. No HF network, physical microphone, speech ASR/MT or TTS test',
    testHostLiteralSubstituted: true,
    adapterSha256: createHash('sha256').update(adapter).digest('hex'), captureSha256: createHash('sha256').update(patched).digest('hex') };
  await writeFile(new URL('./VAD-PROOF.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
