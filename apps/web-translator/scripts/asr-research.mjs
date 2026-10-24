// Controlled synthetic ASR comparison, independent of VAD/microphone/MT/TTS.
// Fixtures and optional pinned Base files stay outside the repository/Space.
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const research = process.env.ASR_RESEARCH_DIR || '/workspace/artifacts/asr-pl-nl-research';
const fixtures = JSON.parse(await readFile(path.join(research, 'fixtures.json')));
const tiny = JSON.parse(await readFile(path.join(root, 'models.lock.json'))).models.find(model => model.id === 'asr');
const baseManifest = JSON.parse(await readFile(path.join(research, 'base/RESEARCH-MANIFEST.json')));
const baseModel = { ...tiny, repo: baseManifest.repo, revision: baseManifest.revision, files: baseManifest.files };
let modelRoot = path.join(root, 'public/models/asr');
const original = await readFile(path.join(root, 'delivery/local-ui-update/payload/assets/inference.worker-DK3oltoU.js'), 'utf8');
assert.equal(original.split('max_new_tokens:128').length, 2);
// Only generation-budget injection in this QA worker; no replacement of inference.
const worker = original.replace('max_new_tokens:128', 'max_new_tokens:e.qaTokenLimit');
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    let body;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><title>Controlled ASR benchmark</title>'); return; }
    if (pathname === '/worker.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(worker); return; }
    if (pathname.startsWith('/models/asr/')) body = await readFile(path.join(modelRoot, pathname.slice('/models/asr/'.length)));
    else if (pathname.startsWith('/runtime/')) body = await readFile(path.join(root, 'public', pathname));
    else if (/^\/(pl|nl)-(160|220)\.f32$/.test(pathname)) body = await readFile(path.join(research, pathname.slice(1)));
    else { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', pathname.endsWith('.mjs') ? 'application/javascript' : pathname.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const external = [], results = [];
const normalize = text => text.toLocaleLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
function wer(reference, output) {
  const a = normalize(reference), b = normalize(output);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j-1]+1, prev[j]+1, prev[j-1]+Number(a[i-1] !== b[j-1]));
    prev = row;
  }
  return { wordErrors: prev[b.length], referenceWords: a.length, wer: prev[b.length] / a.length };
}
try {
  for (const [name, catalog, folder] of [['tiny', tiny, path.join(root, 'public/models/asr')], ['base', baseModel, path.join(research, 'base')]]) {
    modelRoot = folder;
    for (const file of catalog.files) {
      const data = await readFile(path.join(folder, file.path));
      assert.equal(data.length, file.bytes); assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256);
    }
    const context = await browser.newContext();
    context.on('request', req => { if (!req.url().startsWith(origin + '/') && !req.url().startsWith('blob:')) external.push(new URL(req.url()).origin); });
    const page = await context.newPage(); await page.goto(origin);
    await page.evaluate(async ({ origin, catalog }) => {
      const cache = await caches.open('medpartners-v2-%2F-models');
      for (const file of catalog.files) {
        const url = origin + '/models/asr/' + file.path; await cache.put(url, await fetch(url));
      }
      window.worker = new Worker(origin + '/worker.js', { type: 'module' });
      let next = 0;
      window.call = (type, args) => new Promise((resolve, reject) => {
        const id = ++next, timer = setTimeout(() => reject(Error('ASR benchmark timeout')), 180000);
        worker.onmessage = ({ data }) => { if (data.id !== id) return; clearTimeout(timer); data.error ? reject(Error(data.error)) : resolve({ ...data.result, ms: data.ms }); };
        worker.postMessage({ id, type, ...args });
      });
      await window.call('init', { base: origin + '/', models: [catalog], speech: true });
    }, { origin, catalog });
    for (const fixture of fixtures) for (const tokens of [128, 256]) {
      const output = await page.evaluate(async ({ fixture, tokens }) => {
        const response = await fetch('/' + fixture.file);
        const audio = new Float32Array(await response.arrayBuffer());
        return window.call('recognize', { audio, source: fixture.lang, qaTokenLimit: tokens });
      }, { fixture, tokens });
      const result = { model: name, id: fixture.id, duration: fixture.duration, generationLimit: tokens,
        reference: fixture.reference, text: output.text, ms: output.ms, ...wer(fixture.reference, output.text || ''),
        synthetic: true, viaVAD: false, sampleRate: 16000, forcedLanguage: fixture.lang };
      results.push(result); console.log(JSON.stringify(result));
      await writeFile(path.join(research, 'RESULTS.json'), JSON.stringify({ results, externalRequests: external, physicalAndroid: false }, null, 2));
    }
    await context.close();
  }
  assert.deepEqual(external, []);
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
