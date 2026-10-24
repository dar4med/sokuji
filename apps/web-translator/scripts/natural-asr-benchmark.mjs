// Human FLEURS evaluation. No production writes, synthetic transcripts or remote inference.
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const research = process.env.NATURAL_ASR_DIR || '/workspace/artifacts/natural-asr';
const corpus = JSON.parse(await readFile(path.join(research, 'CORPUS.json')));
const inputMode = process.env.NATURAL_INPUT_MODE || 'direct';
const segmented = inputMode === 'vad' ? JSON.parse(await readFile(path.join(research, 'VAD-SEGMENTS.json'))) : null;
if (segmented) assert.equal(segmented.corpusSha256, corpus.corpusSha256);
const baseFolder = process.env.WHISPER_BASE_DIR || '/workspace/artifacts/asr-pl-nl-research/base';
const lock = JSON.parse(await readFile(path.join(root, 'models.lock.json')));
const tiny = lock.models.find(model => model.id === 'asr');
const baseManifest = JSON.parse(await readFile(path.join(baseFolder, 'RESEARCH-MANIFEST.json')));
const base = { ...tiny, repo: baseManifest.repo, revision: baseManifest.revision, files: baseManifest.files };
let variants = [['tiny', tiny, path.join(root, 'public/models/asr')], ['base', base, baseFolder]];
if (process.env.NATURAL_MODELS === 'small') {
  const folder = path.join(research, 'small');
  const manifest = JSON.parse(await readFile(path.join(folder, 'RESEARCH-MANIFEST.json')));
  variants = [['small', { ...tiny, repo: manifest.repo, revision: manifest.revision, files: manifest.files }, folder]];
}
const perLanguageStart = Number(process.env.NATURAL_SAMPLE_START_PER_LANG || 0);
const perLanguageLimit = Number(process.env.NATURAL_SAMPLE_LIMIT_PER_LANG || Infinity);
const fixturesToRun = corpus.samples.filter(sample => {
  const index = corpus.samples.filter(other => other.languageCode === sample.languageCode).indexOf(sample);
  return index >= perLanguageStart && index < perLanguageStart + perLanguageLimit;
});
const callTimeoutMs = Number(process.env.NATURAL_CALL_TIMEOUT_MS || 180000);
const runTimeoutMs = Number(process.env.NATURAL_RUN_TIMEOUT_MS || Infinity);
const maxRssBytes = Number(process.env.NATURAL_MAX_RSS_MB || Infinity) * 1024 * 1024;
const rawWorker = await readFile(path.join(root, 'delivery/hf-static/worker-runtime/inference.worker-DK3oltoU.js'), 'utf8');
assert.equal(createHash('sha256').update(rawWorker).digest('hex'), 'd6fbb7329848723c4979700a88f1361e6c32b8140fa7b5758e548a9a3b8066dc');
// Preserve pre-filter ASR only in this research worker. Inference/options/filter unchanged.
assert.equal(rawWorker.split('r=Jn(t)?').length, 2);
assert.equal(rawWorker.split(':{text:t}}}else').length, 2);
const worker = rawWorker.replace('r=Jn(t)?', 'r={qaRawAsr:t,...(Jn(t)?').replace(':{text:t}}}else', ':{text:t})}}}else');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const normalize = text => (text.normalize('NFC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
    previous = row;
  }
  return previous[b.length];
}
function score(reference, hypothesis) {
  const words = normalize(reference), predicted = normalize(hypothesis);
  const errors = distance(words, predicted);
  return { errors, referenceWords: words.length, wer: errors / words.length };
}
const fixturePaths = new Map(corpus.samples.map(sample => ['/' + sample.pcmFile, sample]));
for (const sample of segmented?.samples || []) for (const segment of sample.segments) {
  const data = await readFile(path.join(research, segment.file)); assert.equal(sha(data), segment.sha256);
  fixturePaths.set('/' + segment.file, { pcmFile: segment.file });
}
for (const sample of corpus.samples) {
  const bytes = await readFile(path.join(research, sample.pcmFile));
  assert.equal(sha(bytes), sample.pcmSha256); assert.equal(bytes.length, sample.num_samples * 4);
}
let modelFolder;
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    let body;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><title>Natural human ASR benchmark</title>'); return; }
    if (pathname === '/worker.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(worker); return; }
    if (fixturePaths.has(pathname)) body = await readFile(path.join(research, fixturePaths.get(pathname).pcmFile));
    else if (pathname.startsWith('/models/asr/') && !pathname.includes('..')) body = await readFile(path.join(modelFolder, pathname.slice('/models/asr/'.length)));
    else if (/^\/runtime\/ort-wasm-simd-threaded\.(mjs|wasm)$/.test(pathname)) body = await readFile(path.join(root, 'public', pathname));
    else { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', pathname.endsWith('.mjs') ? 'application/javascript' : pathname.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const report = { corpusSha256: corpus.corpusSha256, startedAt: new Date().toISOString(),
  environment: { platform: os.platform(), cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, node: process.version,
    runtime: 'onnxruntime-web1.22.0, existing SIMD WASM', wasmThreads: 1, proxy: false,
    runtimeMjsSha256: sha(await readFile(path.join(root, 'public/runtime/ort-wasm-simd-threaded.mjs'))),
    runtimeWasmSha256: sha(await readFile(path.join(root, 'public/runtime/ort-wasm-simd-threaded.wasm'))) },
  options: { task: 'transcribe', forcedLanguages: { pl: 'polish', nl: 'dutch' }, max_new_tokens: 128, return_timestamps: false, device: 'wasm', dtype: 'q8' },
  normalization: 'Unicode NFC, lowercase, tokens are runs of Unicode letters/numbers; punctuation/apostrophes/hyphens are separators. Preserve diacritics and digits; no numeric expansion or transcript correction. Micro WER=sumLevenshtein/sumReferenceWords.',
  measurements: 'Cold init=new browser/worker, models already SHA-verified in CacheStorage, no download time. Pass1 first/cold then remaining calls; pass2 same model retained/warm. Browser RSS sums sampled live browser processes every~100ms; includes shared pages/services/cache, no PSS, may miss short peaks. Not exact JS or WASM heap, not Android RAM.',
  variants: [], results: [], externalRequests: [], physicalAndroid: false, viaVAD: inputMode === 'vad' };
report.limits = { callTimeoutMs, runTimeoutMs: Number.isFinite(runTimeoutMs) ? runTimeoutMs : null, maxRssBytes: Number.isFinite(maxRssBytes) ? maxRssBytes : null };
const save = () => writeFile(path.join(research, process.env.NATURAL_OUTPUT || (inputMode === 'vad' ? 'BENCHMARK-VAD.json' : 'BENCHMARK.json')), JSON.stringify(report, null, 2) + '\n');
try {
  for (const [name, model, folder] of variants) {
    modelFolder = folder;
    for (const file of model.files) { const data = await readFile(path.join(folder, file.path)); assert.equal(data.length, file.bytes); assert.equal(sha(data), file.sha256); }
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    const cdp = await browser.newBrowserCDPSession();
    let sampling = true, phase = 'baseline', limitReason = null;
    const variantStarted = performance.now();
    const memory = {}, samplingErrors = [];
    async function sample() {
      try {
        const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
        let total = 0;
        for (const process of processInfo) {
          try { const status = await readFile('/proc/' + process.id + '/status', 'utf8'); total += Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024; } catch { /* An exited child has no current RSS. */ }
        }
        memory[phase] = Math.max(memory[phase] || 0, total);
        if (!limitReason && (total > maxRssBytes || performance.now() - variantStarted > runTimeoutMs)) {
          limitReason = total > maxRssBytes ? 'RSS budget exceeded' : 'Run time budget exceeded';
          sampling = false; void browser.close().catch(() => {});
        }
      } catch { if (!samplingErrors.length) samplingErrors.push('Browser process RSS sampling unavailable'); }
    }
    const sampler = (async () => { while (sampling) { await sample(); await new Promise(resolve => setTimeout(resolve, 100)); } })();
    const variant = { model: name, repo: model.repo, revision: model.revision, filesBytes: model.files.reduce((sum, file) => sum + file.bytes, 0),
      browser: browser.version(), coldInitMs: null, crossOriginIsolated: null, memoryPeakRssBytes: memory, samplingErrors };
    report.variants.push(variant);
    try {
    const context = await browser.newContext();
    context.on('request', req => { if (!req.url().startsWith(origin + '/') && !req.url().startsWith('blob:')) report.externalRequests.push(new URL(req.url()).origin); });
    const page = await context.newPage(); await page.goto(origin);
    await sample(); phase = 'cacheFill';
    await page.evaluate(async ({ origin, model }) => {
      const cache = await caches.open('medpartners-v2-%2F-models');
      for (const file of model.files) {
        const url = origin + '/models/asr/' + file.path; await cache.put(url, await fetch(url));
      }
      window.call = null;
    }, { origin, model });
    phase = 'modelInit'; const initStart = performance.now();
    await page.evaluate(async ({ origin, model, callTimeoutMs }) => {
      window.worker = new Worker(origin + '/worker.js', { type: 'module' });
      let next = 0;
      window.call = (type, args) => new Promise((resolve, reject) => {
        const id = ++next, timer = setTimeout(() => reject(Error('Natural ASR benchmark timeout')), callTimeoutMs);
        worker.onmessage = ({ data }) => { if (data.id !== id) return; clearTimeout(timer); data.error ? reject(Error(data.error)) : resolve({ ...data.result, ms: data.ms }); };
        worker.postMessage({ id, type, ...args });
      });
      await window.call('init', { base: origin + '/', models: [model], speech: true });
    }, { origin, model, callTimeoutMs });
    variant.coldInitMs = performance.now() - initStart;
    variant.crossOriginIsolated = await page.evaluate(() => crossOriginIsolated); phase = 'inference';
      for (const pass of process.env.NATURAL_PASSES === '1' || inputMode === 'vad' ? [1] : [1, 2]) for (const fixture of fixturesToRun) {
        const started = performance.now();
        const files = segmented ? segmented.samples.find(sample => sample.language === fixture.languageCode && sample.id === fixture.id).segments.map(segment => segment.file) : [fixture.pcmFile];
        const pieces = await page.evaluate(async ({ fixture, files }) => {
          const results = [];
          for (const file of files) {
            const audio = new Float32Array(await (await fetch('/' + file)).arrayBuffer());
            results.push(await window.call('recognize', { audio, source: fixture.languageCode }));
          }
          return results;
        }, { fixture, files });
        const response = { qaRawAsr: pieces.map(piece => piece.qaRawAsr ?? piece.text).join(' '),
          text: pieces.map(piece => piece.text).filter(Boolean).join(' '), ms: pieces.reduce((sum, piece) => sum + piece.ms, 0),
          warning: pieces.map(piece => piece.warning).filter(Boolean).join(' | ') || null };
        const result = { model: name, pass, language: fixture.languageCode, id: fixture.id, rowIndex: fixture.rowIndex,
          duration: fixture.duration, reference: fixture.raw_transcription, rawAsr: response.qaRawAsr ?? response.text,
          applicationText: response.text, warning: response.warning ?? null, engineMs: response.ms,
          wallMs: performance.now() - started, rtf: response.ms / (fixture.duration * 1000), segmentFiles: files };
        Object.assign(result, { rawScore: score(result.reference, result.rawAsr), applicationScore: score(result.reference, result.applicationText) });
        report.results.push(result); await sample(); await save();
        console.log(JSON.stringify({ model: name, pass, language: result.language, id: result.id, ms: result.engineMs, wer: result.rawScore.wer, text: result.rawAsr.slice(0, 170) }));
      }
    } catch (error) {
      variant.stopped = limitReason || (String(error.message).includes('timeout') ? 'Per-call time budget exceeded' : 'Benchmark execution failed');
      variant.completedSamples = report.results.filter(result => result.model === name).length;
      report.stopped = true;
      console.log(JSON.stringify({ model: name, stopped: variant.stopped, completedSamples: variant.completedSamples }));
    } finally { sampling = false; await sampler; await browser.close(); }
    await save();
  }
  assert.deepEqual(report.externalRequests, []);
  report.completedAt = new Date().toISOString(); report.passedExecution = !report.stopped; await save();
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
