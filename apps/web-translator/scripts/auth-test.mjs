// Local loopback fixture, not Apache/LiteSpeed or a hosting deployment.
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import ts from 'typescript';
import { testMetadata } from './test-metadata.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const report = { ...testMetadata(), harness: 'Node loopback Basic Auth; not Apache/LiteSpeed/TLS', checks: [], variants: [], passed: false };
async function inventory(directory = dist, prefix = '') {
  const files = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(files, await inventory(path.join(directory, entry.name), name + '/'));
    else {
      const hash = createHash('sha256'); let bytes = 0;
      for await (const chunk of createReadStream(path.join(directory, entry.name))) { hash.update(chunk); bytes += chunk.length; }
      files[name] = { bytes, sha256: hash.digest('hex') };
    }
  }
  return files;
}
report.payload = await inventory();
const check = text => { report.checks.push(text); console.log('PASS', text); };
const credentials = { username: randomBytes(12).toString('hex'), password: randomBytes(24).toString('hex') };
const auth = 'Basic ' + Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
const apache = await readFile(path.join(dist, '.htaccess'), 'utf8');
const csp = apache.match(/Content-Security-Policy "([^"]+)"/)[1];
const models = JSON.parse(await readFile(path.join(dist, 'models-manifest.json'), 'utf8')).models;
const fixture = Buffer.from('abcdefgh');
const fixtureHash = createHash('sha256').update(fixture).digest('hex');
const servers = [];
let browser;
let outsideHits = 0;
const target = http.createServer((_req, res) => { outsideHits++; res.end('outside origin'); });
await new Promise(resolve => target.listen(0, '127.0.0.1', resolve)); servers.push(target);
const foreignOrigin = `http://127.0.0.1:${target.address().port}`;
async function serve(prefix) {
  const state = { revoked: false, update: false, fixtureMode: 'valid', cancelled: 0, fixtureHits: 0 };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const control = prefix + '__qa/';
      if (req.headers.authorization !== auth || (state.revoked && !url.pathname.startsWith(control))) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="local-fictional-test"', 'Cache-Control': 'no-store' }); res.end('Authentication required'); return;
      }
      if (req.method === 'POST' && url.pathname === control + 'revoke') { state.revoked = true; res.end('revoked'); return; }
      if (req.method === 'POST' && url.pathname === control + 'restore') { state.revoked = false; res.end('restored'); return; }
      if (url.pathname === '/outside-probe') { res.end(req.method === 'POST' ? 'outside POST' : 'outside translator'); return; }
      const mount = prefix !== '/' && url.pathname.startsWith('/other/') ? '/other/' : prefix;
      if (!url.pathname.startsWith(mount)) { res.writeHead(404); res.end('outside 404'); return; }
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader('Content-Security-Policy', csp);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      if (url.pathname.startsWith(control) && url.pathname.endsWith('.js')) {
        const name = path.basename(url.pathname, '.js');
        assert.ok(['cache', 'installation', 'core'].includes(name));
        const source = await readFile(path.join(root, 'src', name + '.ts'), 'utf8');
        const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replaceAll('.ts"', '.js"');
        res.setHeader('Content-Type', 'application/javascript'); res.end(code); return;
      }
      if (url.pathname === prefix + 'models/qa/fixture.onnx') {
        state.fixtureHits++;
        if (state.fixtureMode.endsWith('redirect')) {
          res.writeHead(302, { Location: state.fixtureMode === 'cross-redirect' ? foreignOrigin + '/target' : '/outside-probe' }); res.end(); return;
        }
        res.setHeader('Content-Type', 'application/octet-stream');
        if (state.fixtureMode === 'stall') { res.write(fixture.subarray(0, 4)); res.on('close', () => state.cancelled++); }
        else res.end(fixture);
        return;
      }
      let relative = decodeURIComponent(url.pathname.slice(mount.length)) || 'index.html';
      const file = path.resolve(dist, relative);
      if (!file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
      let content;
      try { content = await readFile(file); } catch { res.writeHead(404); res.end('not found'); return; }
      const mime = { '.html':'text/html', '.js':'application/javascript', '.mjs':'application/javascript', '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      if (relative === 'sw.js' && state.update) content = Buffer.from(content.toString().replace(/(const CACHE = names.shellPrefix \+ '[^']+)';/, "$1-local-update';"));
      res.setHeader('Content-Length', content.length); res.end(content);
    } catch (error) { res.writeHead(500); res.end('local fixture error'); console.error(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); servers.push(server);
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, base: origin + prefix, state };
}
async function suite(base, prefix, label) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/browser-test.mjs'], { cwd: root, stdio: 'inherit',
      env: { ...process.env, TEST_URL: base, QA_HTTP_AUTH: JSON.stringify(credentials), QA_REPORT_LABEL: label,
        QA_AUTH_CONTROL_BASE: base + '__qa/' } });
    child.on('error', reject); child.on('exit', resolve);
  });
  assert.equal(code, 0, 'real MT/audio suite: ' + prefix);
  const result = JSON.parse(await readFile(path.join(root, 'test-results', label + '-results.json'), 'utf8'));
  assert.equal(result.passed, true); assert.equal(result.translations.length, 18); assert.equal(result.audioRuns.length, 3);
  report.variants.push({ prefix, origin: new URL(base).origin, report: label + '-results.json', translations: 18, audio: 3 });
}
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'], env: { ...process.env, HOME: '/tmp/medpartners-auth-tests' } });
  const { base, origin, state } = await serve('/translator-test/');
  const firstScript = (await readFile(path.join(dist, 'index.html'), 'utf8')).match(/src="([^"]+\.js)"/)[1];
  for (const resource of ['index.html', firstScript, 'sw.js', 'models/asr/' + models.find(m => m.id === 'asr').files[0].path]) {
    assert.equal((await fetch(new URL(resource, base))).status, 401);
  }
  check('Anonymous index/JS/SW/model all return 401; no public model exception');
  for (const model of models) for (const file of model.files) {
    const response = await fetch(new URL(`models/${model.id}/${file.path}`, base), { headers: { Authorization: auth } });
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  check('Authenticated HTTP download: all 34 pinned artifacts length and SHA-256 PASS');
  const context = await browser.newContext({ httpCredentials: credentials });
  const page = await context.newPage();
  await page.goto(origin + '/outside-probe');
  await page.evaluate(async () => {
    for (const name of ['wordpress-control', 'medpartners-models-v1', 'medpartners-shell-legacy', 'medpartners-v2-%2Fother%2F-models', 'medpartners-v2-%2Fother%2F-shell-control', 'medpartners-v2-%2Ftranslator-test%2F-shell-old']) {
      const cache = await caches.open(name); await cache.put('/control-marker', new Response('preserve'));
    }
  });
  await page.goto(base);
  await page.waitForFunction(() => document.documentElement.dataset.startup === 'ready' && !!navigator.serviceWorker.controller);
  const names = await page.evaluate(async base => (await import(base + '__qa/installation.js')).cacheNamesForPath('/translator-test/'), base);
  const preserved = ['wordpress-control', 'medpartners-models-v1', 'medpartners-shell-legacy', 'medpartners-v2-%2Fother%2F-models', 'medpartners-v2-%2Fother%2F-shell-control'];
  let keys = await page.evaluate(() => caches.keys());
  for (const name of preserved) assert.ok(keys.includes(name), name);
  assert.ok(!keys.includes(names.shellPrefix + 'old'));
  const other = await context.newPage(); await other.goto(origin + '/other/');
  await other.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.equal(await page.evaluate(async url => (await fetch(url)).text(), origin + '/outside-probe'), 'outside translator');
  assert.equal(await page.evaluate(async url => (await fetch(url, { method: 'POST' })).text(), origin + '/outside-probe'), 'outside POST');
  const outside = await context.newPage(); const response = await outside.goto(origin + '/outside-missing'); assert.equal(response.status(), 404); await outside.close();
  check('Actual second directory/SW and WordPress/legacy control caches coexist; outside GET/POST/navigation do not receive translator fallback');
  await page.evaluate(async name => (await caches.open(name)).put('/own-fixture', new Response('own')), names.models);
  await page.locator('#delete-models').evaluate(el => el.closest('details').open = true);
  await page.locator('#delete-models').click();
  // pairChanged() may immediately reopen the now-empty cache to display size.
  await page.waitForFunction(async name => !(await (await caches.open(name)).match('/own-fixture')), names.models);
  keys = await page.evaluate(() => caches.keys());
  assert.equal(await page.evaluate(async name => (await (await caches.open(name)).keys()).length, names.models), 0);
  for (const name of preserved.filter(n => !n.endsWith('shell-control'))) assert.ok(keys.includes(name), name);
  const otherModels = 'medpartners-v2-%2Fother%2F-models'; assert.ok(keys.includes(otherModels));
  check('Delete models removes only this installation; other directory, WordPress and legacy caches preserved');
  const before = keys.filter(k => k.startsWith(names.shellPrefix));
  state.update = true;
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await page.waitForFunction(async ({ prefix, before }) => {
    const keys = await caches.keys();
    return keys.some(k => k.startsWith(prefix) && k.endsWith('-local-update')) && before.every(k => !keys.includes(k));
  }, { prefix: names.shellPrefix, before });
  keys = await page.evaluate(() => caches.keys());
  for (const name of before) assert.ok(!keys.includes(name));
  for (const name of ['wordpress-control', 'medpartners-models-v1', 'medpartners-shell-legacy', otherModels]) assert.ok(keys.includes(name));
  check('Real SW update/activation deletes only old own shell, preserves unrelated caches');
  state.update = false;
  const fixtureFile = { path: 'fixture.onnx', bytes: fixture.length, sha256: fixtureHash };
  const runDownload = async (baseArg = base, file = fixtureFile) => page.evaluate(async ({ ownBase, baseArg, file }) => {
    const { prepareModels, modelCacheName } = await import(ownBase + '__qa/cache.js');
    const cache = await caches.open(modelCacheName(ownBase));
    await cache.delete(ownBase + 'models/qa/fixture.onnx');
    try { await prepareModels(baseArg, [{ id: 'qa', files: [file] }], new AbortController().signal, () => {}, 150); return { ok: true }; }
    catch (error) { return { ok: false, error: error.message, cached: !!(await cache.match(ownBase + 'models/qa/fixture.onnx')) }; }
  }, { ownBase: base, baseArg, file });
  state.fixtureMode = 'stall'; let result = await runDownload(); assert.equal(result.ok, false); assert.match(result.error, /brak danych/); assert.equal(result.cached, false);
  state.fixtureMode = 'valid'; assert.equal((await runDownload()).ok, true);
  assert.ok(state.cancelled >= 1);
  result = await runDownload(base, { ...fixtureFile, sha256: '0'.repeat(64) }); assert.equal(result.ok, false); assert.equal(result.cached, false);
  for (const mode of ['redirect', 'cross-redirect']) { state.fixtureMode = mode; result = await runDownload(); assert.equal(result.ok, false); assert.equal(result.cached, false); }
  assert.equal(outsideHits, 0);
  for (const bad of [foreignOrigin + '/translator-test/', base.replace('http://', 'http://x:y@'), base + '../', base + '?x']) assert.equal((await runDownload(bad)).ok, false);
  for (const path of ['../escape', '%2e%2e/escape', '//other.test/file', 'a/./b', 'a\\b']) assert.equal((await runDownload(base, { ...fixtureFile, path })).ok, false);
  const manifestRejected = await page.evaluate(async base => {
    const { validateManifest } = await import(base + '__qa/core.js');
    const manifest = await (await fetch(base + 'models-manifest.json')).json();
    manifest.models[0].files[0].path = '../escape';
    try { validateManifest(manifest); return false; } catch { return true; }
  }, base);
  assert.equal(manifestRejected, true);
  check('Browser production downloader: stalled stream cancellation/retry, bad SHA, manifest/path/base/userinfo/cross-origin/redirect rejection; no partial cache or redirect target hit');
  await context.close();
  await suite(base, '/translator-test/', 'auth-prefix-browser');
  const rootVariant = await serve('/');
  await suite(rootVariant.base, '/', 'auth-root-browser');
  check('Identical portable base ./ payload passes full real suite at protected /translator-test/ and separate-origin root /');
  assert.deepEqual(await inventory(), report.payload, 'payload unchanged during both variants');
  report.passed = true;
} catch (error) { report.error = error.stack; console.error(error.stack); process.exitCode = 1; }
finally {
  await browser?.close();
  for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await writeFile(path.join(root, 'test-results/auth-results.json'), JSON.stringify({ ...report, completedAt: new Date().toISOString() }, null, 2));
}
