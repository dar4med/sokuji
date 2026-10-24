import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { applyLocalUpdate } from '../delivery/local-ui-update/apply-local-update.mjs';

const meta = (body: string) => ({ bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') });
async function fixture(t: any) {
  const root = await mkdtemp(path.join(tmpdir(), 'translator-update-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, 'existing'), source = path.join(root, 'delta');
  await mkdir(path.join(target, 'assets'), { recursive: true });
  await mkdir(path.join(source, 'payload/assets'), { recursive: true });
  const base = { 'index.html': 'old index', 'sw.js': 'old SW', '.htaccess': 'unchanged auth', 'existing-model': 'unchanged model' };
  const files = { 'index.html': 'new index', 'sw.js': 'new SW', 'assets/index-new.js': 'new UI', 'assets/capture-new.js': 'new VAD', 'assets/inference.worker-new.js': 'new ASR gate' };
  for (const [name, body] of Object.entries(base)) await writeFile(path.join(target, name), body);
  for (const [name, body] of Object.entries(files)) await writeFile(path.join(source, 'payload', name), body);
  await writeFile(path.join(source, 'update-manifest.json'), JSON.stringify({ schema: 1,
    baseSourceSha: 'c29b166bc4a79d03c012293ed7f6c83cffb3e9c6', sourceSha: 'a'.repeat(40),
    baseFiles: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, meta(v)])),
    files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, meta(v)])) }));
  return { target, source, files, base };
}
test('local update replaces only static files, preserves model/auth, backs up HTML/SW and tolerates reapply', async t => {
  const f = await fixture(t);
  const result = await applyLocalUpdate(f);
  t.after(() => rm(result.backup, { recursive: true, force: true }));
  assert.equal(result.modelsDownloaded, 0);
  for (const [name, body] of Object.entries(f.files)) assert.equal(await readFile(path.join(f.target, name), 'utf8'), body);
  for (const name of ['.htaccess', 'existing-model']) assert.equal(await readFile(path.join(f.target, name), 'utf8'), f.base[name as keyof typeof f.base]);
  assert.equal(await readFile(path.join(result.backup, 'index.html'), 'utf8'), 'old index');
  const repeated = await applyLocalUpdate(f);
  t.after(() => rm(repeated.backup, { recursive: true, force: true }));
  assert.equal(repeated.updated.length, 5);
});
test('corrupt update aborts before any target write', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.source, 'payload/assets/inference.worker-new.js'), 'corrupt');
  await assert.rejects(applyLocalUpdate(f), /Update SHA mismatch/);
  for (const [name, body] of Object.entries(f.base)) assert.equal(await readFile(path.join(f.target, name), 'utf8'), body);
  await assert.rejects(readFile(path.join(f.target, 'assets/index-new.js')), { code: 'ENOENT' });
});
test('a different base package aborts before writes', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.target, 'existing-model'), 'different model');
  await assert.rejects(applyLocalUpdate(f), /Base file mismatch: existing-model/);
  assert.equal(await readFile(path.join(f.target, 'index.html'), 'utf8'), 'old index');
});
