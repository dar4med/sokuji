import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const origin = 'https://dar4med-med-partners-translator-test.static.hf.space';
const source = readFileSync(new URL('../delivery/hf-static/capture-import-url.js', import.meta.url), 'utf8');
function resolve(where: string, script: string, query = '?__sign=fictional-private-value&other=never-copy') {
  const context: any = { location: { origin: where, href: where + '/index.html' + query }, URL,
    testImportMeta: { url: script } };
  runInNewContext(source.replaceAll('import.meta', 'testImportMeta') + '\nresult = hfCaptureImportURL();', context);
  return new URL(context.result);
}
test('capture import gets only the current sign on exact HF origin and owned path', () => {
  const url = resolve(origin, origin + '/assets/index-CJ_k8XCq.js');
  assert.equal(url.origin, origin); assert.equal(url.pathname, '/assets/capture-Bh2ZntkC.js');
  assert.equal(url.searchParams.get('__sign'), 'fictional-private-value');
  assert.deepEqual([...url.searchParams.keys()], ['__sign']);
});
test('absent sign, other host, foreign module origin and unexpected directory remain unsigned', () => {
  const cases = [
    [origin, origin + '/assets/index.js', ''],
    ['https://other.test', 'https://other.test/assets/index.js', '?__sign=fictional'],
    [origin, 'https://other.test/assets/index.js', '?__sign=fictional'],
    [origin, origin + '/other/index.js', '?__sign=fictional'],
  ];
  for (const [where, script, query] of cases) assert.equal(resolve(where, script, query).search, '');
});
test('non-HF deployments preserve relative subdirectory resolution', () => {
  const url = resolve('http://localhost:18573', 'http://localhost:18573/translator-test/assets/index.js');
  assert.equal(url.href, 'http://localhost:18573/translator-test/assets/capture-Bh2ZntkC.js');
});
