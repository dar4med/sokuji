import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../delivery/hf-static/hf-session-adapter.js', import.meta.url), 'utf8');
const origin = 'https://dar4med-med-partners-translator-test.static.hf.space';
const workerPath = '/assets/inference.worker-DK3oltoU.js';
function setup(where = origin, query = '?__sign=fictional-private-value&other=never-copy') {
  const calls: any[] = [];
  class NativeWorker { constructor(...args: any[]) { calls.push(args); } }
  let requests = 0;
  const window: any = { Worker: NativeWorker, fetch: async () => {
    requests++;
    return { ok: false, status: 401, body: null };
  } };
  const location = { origin: where, href: where + '/index.html' + query };
  const context = { window, self: { location }, location, document: { baseURI: location.href }, URL,
    AbortController, setTimeout, clearTimeout, fetch: (...args: any[]) => window.fetch(...args) };
  runInNewContext(source, context);
  return { window, NativeWorker, calls, context, requests: () => requests };
}
test('sign is copied only to exact same-origin inference worker; options/prototype remain intact', () => {
  const f = setup(); const options = { type: 'module', credentials: 'same-origin' };
  const instance = new f.window.Worker(new URL(origin + workerPath), options);
  assert.ok(instance instanceof f.NativeWorker);
  const url = f.calls[0][0];
  assert.equal(url.origin, origin); assert.equal(url.pathname, workerPath);
  assert.equal(url.searchParams.get('__sign'), 'fictional-private-value');
  assert.deepEqual([...url.searchParams.keys()], ['__sign']);
  assert.equal(f.calls[0][1], options);
});
test('foreign/path/query/fragment/userinfo workers are passed through with original arguments', () => {
  for (const input of ['https://foreign.test' + workerPath, origin + '/assets/other.js',
    origin + workerPath + '?existing=yes', origin + workerPath + '#fragment',
    origin.replace('https://', 'https://user:pass@') + workerPath, 'blob:fictional']) {
    const f = setup(); const options = { type: 'module' };
    new f.window.Worker(input, options);
    assert.equal(f.calls[0][0], input); assert.equal(f.calls[0][1], options);
  }
});
test('missing sign and other hosting origins do not change worker URLs or install runtime hook', () => {
  const f = setup(origin, ''); new f.window.Worker(workerPath);
  assert.equal(f.calls[0][0], workerPath);
  const elsewhere = setup('https://example.test');
  assert.equal(elsewhere.window.Worker, elsewhere.NativeWorker);
  assert.equal(elsewhere.window.__medPartnersHfRuntimePaths, undefined);
});
test('reloading adapter does not stack constructors; subclassing remains supported', () => {
  const f = setup(); const once = f.window.Worker;
  runInNewContext(source, f.context); assert.equal(f.window.Worker, once);
  class Child extends f.window.Worker {}
  const child = new Child(workerPath);
  assert.ok(child instanceof Child); assert.ok(child instanceof f.NativeWorker);
  assert.equal(f.calls.length, 1);
});
test('runtime fetch failure is sanitized and retryable without exposing session/signature', async () => {
  const f = setup();
  for (let i = 0; i < 2; i++) await assert.rejects(f.window.__medPartnersHfRuntimePaths(), (error: any) => {
    assert.match(error.message, /MJS/);
    assert.equal(error.message.includes('fictional'), false);
    assert.equal(error.message.includes('__sign'), false); return true;
  });
  assert.equal(f.requests(), 2);
});
