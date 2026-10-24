// Compare MT controls using human parallel references and actual ASR outputs.
// Output differences alone are not a semantic quality judgment.
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const folder = process.env.NATURAL_ASR_DIR || '/workspace/artifacts/natural-asr';
const corpus = JSON.parse(await readFile(path.join(folder, 'CORPUS.json')));
const asr = JSON.parse(await readFile(path.join(folder, 'BENCHMARK.json')));
if (process.env.NATURAL_MT_SMALL === '1') {
  for (const name of ['SMALL-PILOT.json', 'SMALL-REMAINDER.json']) {
    const extra = JSON.parse(await readFile(path.join(folder, name)));
    assert.equal(extra.corpusSha256, corpus.corpusSha256); asr.results.push(...extra.results);
  }
}
assert.equal(asr.corpusSha256, corpus.corpusSha256);
const models = JSON.parse(await readFile(path.join(root, 'models.lock.json'))).models.filter(model => model.id !== 'asr');
const allowed = new Map(models.flatMap(model => model.files.map(file => ['/models/' + model.id + '/' + file.path, path.join(root, 'public/models', model.id, file.path)])));
for (const model of models) for (const file of model.files) {
  const bytes = await readFile(path.join(root, 'public/models', model.id, file.path));
  assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
}
const worker = await readFile(path.join(root, 'delivery/hf-static/worker-runtime/inference.worker-DK3oltoU.js'));
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><title>MT controls</title>'); return; }
    if (pathname === '/worker.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(worker); return; }
    const file = allowed.get(pathname) || (/^\/runtime\/ort-wasm-simd-threaded\.(mjs|wasm)$/.test(pathname) ? path.join(root, 'public', pathname) : null);
    if (!file) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.mjs') ? 'application/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const report = { corpusSha256: corpus.corpusSha256, asrInput: 'Direct ASR pass1 applicationText; BENCHMARK.json and optional Small pilot+remainder. No transcript corrections.',
  mt: 'Existing pinned OpusMT; PL/NL through EN, max_new_tokens192, num_beams1, CPU/WASM/thread1',
  limitation: 'Human parallel target references are provided for review. Lexical differences are not themselves semantic errors. No automatic semantic PASS is assigned.',
  results: [], externalRequests: [] };
try {
  const context = await browser.newContext();
  context.on('request', req => { if (!req.url().startsWith(origin + '/') && !req.url().startsWith('blob:')) report.externalRequests.push(new URL(req.url()).origin); });
  const page = await context.newPage(); await page.goto(origin);
  await page.evaluate(async ({ origin, models }) => {
    const cache = await caches.open('medpartners-v2-%2F-models');
    for (const model of models) for (const file of model.files) {
      const url = origin + '/models/' + model.id + '/' + file.path; await cache.put(url, await fetch(url));
    }
    window.worker = new Worker(origin + '/worker.js', { type: 'module' }); let next = 0;
    window.call = (type, args) => new Promise((resolve, reject) => {
      const id = ++next, timer = setTimeout(() => reject(Error('MT control timeout')), 180000);
      worker.onmessage = ({ data }) => { if (data.id !== id) return; clearTimeout(timer); data.error ? reject(Error(data.error)) : resolve({ ...data.result, ms: data.ms }); };
      worker.postMessage({ id, type, ...args });
    });
    await window.call('init', { base: origin + '/', models, speech: false });
  }, { origin, models });
  for (const sample of corpus.samples) {
    const target = sample.languageCode === 'pl' ? 'nl' : 'pl';
    const humanTarget = corpus.samples.find(other => other.id === sample.id && other.languageCode === target).raw_transcription;
    const variants = [['reference', sample.raw_transcription], ...['tiny', 'base', ...(process.env.NATURAL_MT_SMALL === '1' ? ['small'] : [])].map(model => [model + '-asr', asr.results.find(row => row.model === model && row.pass === 1 && row.language === sample.languageCode && row.id === sample.id).applicationText])];
    for (const [sourceKind, input] of variants) {
      const result = input ? await page.evaluate(async ({ input, source, target }) => window.call('translate', { text: input, source, target }), { input, source: sample.languageCode, target }) : null;
      report.results.push({ id: sample.id, source: sample.languageCode, target, sourceKind, input, humanTarget, output: result?.text ?? null, engineMs: result?.ms ?? null, skippedEmptyAsr: !input });
      await writeFile(path.join(folder, 'MT-CONTROLS.json'), JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify({ id: sample.id, source: sample.languageCode, sourceKind, ms: result?.ms, output: result?.text?.slice(0, 150) }));
    }
  }
  assert.deepEqual(report.externalRequests, []); report.completed = true;
  await writeFile(path.join(folder, 'MT-CONTROLS.json'), JSON.stringify(report, null, 2) + '\n');
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
