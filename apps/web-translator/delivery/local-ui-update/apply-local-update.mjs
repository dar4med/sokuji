// Existing Node only. Local Windows package update, never hosting/deployment.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, rename, realpath, lstat, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const safe = name => typeof name === 'string' && name.split('/').every(p => p && p !== '.' && p !== '..') && !/[\\:\0]/.test(name);
const writable = name => ['index.html','sw.js'].includes(name) || /^assets\/[A-Za-z0-9_.-]+\.js$/.test(name);

async function metadata(file) {
  const stat = await lstat(file);
  check(stat.isFile() && !stat.isSymbolicLink(), `Not a regular file: ${file}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { bytes: stat.size, sha256: hash.digest('hex') };
}
const matches = (a, b) => a.bytes === b.bytes && a.sha256 === b.sha256;

export async function applyLocalUpdate({ target, source, ref }) {
  check(target && (!!source !== !!ref), 'Pass --target and exactly one of --source or --ref');
  if (ref) check(/^[a-f0-9]{40}$/.test(ref), '--ref must be a reviewed full Git commit SHA');
  const root = await realpath(target);
  const assets = await lstat(path.join(root, 'assets'));
  check(assets.isDirectory() && !assets.isSymbolicLink(), 'Expected existing payload/assets directory');
  const load = async name => {
    check(safe(name), 'Invalid update path');
    if (source) return readFile(path.join(source, name));
    const url = `https://raw.githubusercontent.com/dar4med/sokuji/${ref}/apps/web-translator/delivery/local-ui-update/${name}`;
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
    check(response.ok, `GitHub returned HTTP ${response.status} for ${name}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const manifest = JSON.parse(await load('update-manifest.json'));
  check(manifest.schema === 1 && manifest.baseSourceSha === 'c29b166bc4a79d03c012293ed7f6c83cffb3e9c6', 'Wrong base package');
  check(Object.keys(manifest.files).length === 5, 'Expected only five changed static files');
  // Verify the existing package, including models/runtime, without downloading any.
  for (const [name, expected] of Object.entries(manifest.baseFiles)) {
    check(safe(name), 'Invalid base path');
    const actual = await metadata(path.join(root, name));
    check(matches(actual, expected) || (manifest.files[name] && matches(actual, manifest.files[name])), `Base file mismatch: ${name}`);
  }
  const downloaded = [];
  for (const [name, expected] of Object.entries(manifest.files)) {
    check(safe(name) && writable(name), 'Update may contain only HTML, SW and compiled JS');
    const body = await load('payload/' + name);
    check(body.length === expected.bytes && sha(body) === expected.sha256, `Update SHA mismatch: ${name}`);
    if (!manifest.baseFiles[name]) {
      try { check(matches(await metadata(path.join(root, name)), expected), `Unknown existing file: ${name}`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    downloaded.push([name, body]);
  }
  // All validation/downloads precede writes. Keep the old JS and a backup of
  // replaced HTML/SW. Close application tabs and stop the launcher beforehand.
  const backup = await mkdtemp(path.join(tmpdir(), 'translator-ui-backup-'));
  for (const name of ['index.html', 'sw.js'])
    await writeFile(path.join(backup, name), await readFile(path.join(root, name)), { flag: 'wx' });
  downloaded.sort(([a], [b]) => (a === 'sw.js' ? 2 : a === 'index.html' ? 1 : 0) - (b === 'sw.js' ? 2 : b === 'index.html' ? 1 : 0));
  for (const [name, body] of downloaded) {
    const destination = path.join(root, name);
    const temporary = destination + '.local-update-' + process.pid;
    await writeFile(temporary, body, { flag: 'wx' });
    await rename(temporary, destination);
    check(matches(await metadata(destination), manifest.files[name]), `Written file mismatch: ${name}`);
  }
  return { updated: downloaded.map(([name]) => name), sourceSha: manifest.sourceSha, backup, modelsDownloaded: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    check(['--target','--source','--ref'].includes(process.argv[i]) && process.argv[i + 1], 'Invalid argument');
    options[process.argv[i].slice(2)] = process.argv[i + 1];
  }
  try { console.log(JSON.stringify(await applyLocalUpdate(options), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
