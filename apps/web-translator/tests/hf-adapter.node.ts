import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../delivery/hf-static/hf-download-adapter.js', import.meta.url), 'utf8');
const origin = 'https://dar4med-med-partners-translator-test.static.hf.space';
const resource = origin + '/models/pl-en/onnx/decoder_model_merged_quantized.onnx';
const strict = () => ({ credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: new AbortController().signal });
function setup(final = resource, where = origin) {
  const calls: any[] = [];
  let cancelled = false;
  const response = { url: final, type: 'cors', status: 200,
    body: { cancel: async () => { cancelled = true; } },
    text: () => { throw new Error('Adapter must never read a body'); } };
  const native = function (...args: any[]) { calls.push(args); return Promise.resolve(response); };
  const window: any = { fetch: native };
  runInNewContext(source, { window, location: { origin: where }, document: { baseURI: where + '/index.html' }, URL });
  return { window, native, calls, response, cancelled: () => cancelled };
}
test('HF adapter changes only redirect, preserving credentials/cache/signal and response identity', async () => {
  const f = setup('https://us.aws.cdn.hf.co/xet-bridge-us/model?Signature=fictional');
  const init = strict();
  assert.equal(await f.window.fetch(resource, init), f.response);
  const passed = f.calls[0][1];
  assert.equal(passed.redirect, 'follow'); assert.equal(passed.credentials, 'same-origin');
  assert.equal(passed.cache, 'no-store'); assert.equal(passed.signal, init.signal);
  assert.equal(init.redirect, 'error'); assert.equal(f.cancelled(), false);
});
test('HF adapter accepts same-file responses and makes no changes on any other host', async () => {
  const f = setup(); assert.equal(await f.window.fetch(resource, strict()), f.response);
  const elsewhere = setup(resource, 'https://example.test'); assert.equal(elsewhere.window.fetch, elsewhere.native);
});
test('foreign/model-escape/query/header/body/non-GET/other-mode requests keep original strict init', async () => {
  const cases: [any, any][] = [
    [origin + '/runtime/file.wasm', strict()], ['https://foreign.test/models/pl-en/file.onnx', strict()],
    [origin + '/models/../secret', strict()], [origin + '/models/pl-en/%2Fsecret', strict()],
    [resource + '?token=fictional', strict()], [resource + '#fragment', strict()],
    [resource, { ...strict(), headers: { Authorization: 'fictional' } }],
    [resource, { ...strict(), body: 'fictional' }], [resource, { ...strict(), method: 'POST' }],
    [resource, { ...strict(), method: 123 }],
    [resource, { ...strict(), credentials: 'include' }], [resource, { ...strict(), redirect: 'manual' }],
    [new Request(resource, { redirect: 'error', credentials: 'same-origin' }), strict()],
  ];
  for (const [url, init] of cases) {
    const f = setup(); await f.window.fetch(url, init);
    assert.equal(f.calls[0][0], url); assert.equal(f.calls[0][1], init);
  }
});
test('unapproved final destinations are cancelled and rejected without exposing signed URLs', async () => {
  for (const final of ['https://foreign.test/xet-bridge-us/model?Signature=fictional',
    'https://us.aws.cdn.hf.co/other/model?Signature=fictional', origin + '/login?token=fictional', '']) {
    const f = setup(final);
    await assert.rejects(f.window.fetch(resource, strict()), (error: any) => {
      assert.equal(error.message.includes('fictional'), false); return /niezatwierdzonego/.test(error.message);
    });
    assert.equal(f.cancelled(), true);
  }
});
test('native rejection and opaque-response rejection preserve cancellation and fail closed', async () => {
  const f = setup(); f.response.type = 'opaque';
  await assert.rejects(f.window.fetch(resource, strict())); assert.equal(f.cancelled(), true);
  const nativeError = new Error('fictional abort');
  const window: any = { fetch: () => Promise.reject(nativeError) };
  runInNewContext(source, { window, location: { origin }, document: { baseURI: origin + '/' }, URL });
  await assert.rejects(window.fetch(resource, strict()), (error: any) => error === nativeError);
});
