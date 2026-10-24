// Test only the offline helper with generated fictional credentials on loopback.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { testMetadata } from './test-metadata.mjs';
const root = new URL('../', import.meta.url);
const report = { ...testMetadata(), passed: false, checks: [] };
const html = await readFile(new URL('delivery/basic-auth/KONFIGURATOR_BASIC_AUTH.html', root));
const apacheFile = new URL('dist/.htaccess', root);
const original = await readFile(apacheFile, 'utf8');
const temporary = await mkdtemp(path.join(tmpdir(), 'translator-helper-'));
const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  let requests = 0;
  page.on('request', () => requests++);
  const password = randomBytes(24).toString('base64url');
  await page.locator('#user').fill('fictional_tester');
  await page.locator('#password').fill(password);
  await page.locator('#again').fill(password);
  // Fictional path for this local test only; never active in the delivery.
  const passwordFile = '/fictional-test-only/.translator-test.htpasswd';
  await page.locator('#path').fill(passwordFile);
  await page.locator('#confirmed').check();
  await page.locator('#original').setInputFiles({ name: '.htaccess', mimeType: 'text/plain', buffer: Buffer.from(original) });
  await page.locator('#make').click();
  await page.locator('#downloads').waitFor({ state: 'visible' });
  const download = async selector => {
    const event = page.waitForEvent('download');
    await page.locator(selector).click();
    const result = await event;
    const local = path.join(temporary, result.suggestedFilename());
    await result.saveAs(local);
    return readFile(local, 'utf8');
  };
  const hashed = await download('#save-password');
  const config = await download('#save-config');
  assert.match(hashed, /^fictional_tester:\$2y\$12\$[./A-Za-z0-9]{53}\n$/);
  const check = execFileSync('python3', ['-c', 'import crypt,json,sys; p,h=json.load(sys.stdin); print(crypt.crypt(p,h)==h)'],
    { input: JSON.stringify([password, hashed.trim().split(':')[1]]), encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
  assert.equal(check.trim(), 'True');
  assert.equal(config, original.replace(/^Require all denied$/m,
    `AuthType Basic\nAuthName "Med Partners translator-test"\nAuthBasicProvider file\nAuthUserFile "${passwordFile}"\nRequire valid-user`));
  assert.equal(await page.locator('#password').inputValue(), '');
  assert.equal(await page.locator('#again').inputValue(), '');
  assert.equal(requests, 0);
  assert.deepEqual(errors, []);
  report.checks.push('Generated bcrypt cost 12 independently verified by libcrypt; only auth block changed; password inputs cleared; no network after entry');
  report.helperSha256 = createHash('sha256').update(html).digest('hex');
  report.passed = true;
  console.log('PASS', report.checks[0]);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
  await mkdir(new URL('test-results/', root), { recursive: true });
  await writeFile(new URL('test-results/delivery-helper-results.json', root), JSON.stringify(report, null, 2));
}
