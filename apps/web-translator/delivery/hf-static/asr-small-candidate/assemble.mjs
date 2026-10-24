// Assemble an isolated data-only overlay. No upload, app build or package install.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) flags.set(process.argv[i], process.argv[i + 1]);
const here = fileURLToPath(new URL('./', import.meta.url));
const sourceBytes = await readFile(flags.get('--sources') || path.join(here, 'UPLOAD-SOURCES.json'));
const spec = JSON.parse(sourceBytes);
const base = path.resolve(flags.get('--base') || '');
const output = flags.get('--output') && path.resolve(flags.get('--output'));
assert.ok(flags.get('--base') && output, 'Required: --base EXISTING_PAYLOAD --output NEW_DIRECTORY');
assert.ok(output !== base && !output.startsWith(base + path.sep) && !base.startsWith(output + path.sep), 'Output must be separate from the existing payload');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(digest(await readFile(path.join(base, 'models-manifest.json'))), spec.baseModelManifestSha256);
const notice = await readFile(path.join(base, 'notices.txt'));
assert.ok(spec.acceptedBaseNoticesSha256.includes(digest(notice)), 'Unrecognized base notices; preserve original and stop');
await access(path.join(base, 'licenses/APACHE-2.0.txt'));
const append = await readFile(flags.get('--notice-append') || path.join(here, 'ASR-NOTICE-APPEND.txt'));
assert.equal(digest(append), spec.noticeAppendSha256);
await mkdir(output); // Never overwrite an earlier or running installation.
const payload = path.join(output, 'payload'); await mkdir(payload);
const files = [];
async function metadata(file) {
  const bytes = flags.has('--metadata-url-prefix')
    ? Buffer.from(await (await fetch(new URL(file.path, flags.get('--metadata-url-prefix')))).arrayBuffer())
    : await readFile(path.join(here, 'metadata', file.path));
  assert.equal(bytes.length, file.bytes); assert.equal(digest(bytes), file.sha256);
  const dest = path.join(payload, file.path); await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, bytes); files.push({ path: file.path, bytes: bytes.length, sha256: digest(bytes) });
}
for (const file of spec.metadataFiles) await metadata(file);
for (const file of spec.modelFiles) {
  const dest = path.join(payload, file.path); await mkdir(path.dirname(dest), { recursive: true });
  let input;
  if (flags.has('--models-dir')) input = createReadStream(path.join(flags.get('--models-dir'), file.modelPath));
  else {
    assert.ok(file.url.startsWith('https://huggingface.co/onnx-community/whisper-small/resolve/36050c46d777d46dc4b5f43f6d90574fc38f8732/'));
    const response = await fetch(file.url); assert.ok(response.ok && response.body, 'Pinned public model unavailable');
    input = Readable.fromWeb(response.body);
  }
  const hash = createHash('sha256'); let length = 0;
  await pipeline(input, new Transform({ transform(chunk, _encoding, callback) {
    length += chunk.length; if (length > file.bytes) { callback(Error('Oversized model')); return; }
    hash.update(chunk); callback(null, chunk);
  } }), createWriteStream(dest, { flags: 'wx' }));
  const sum = hash.digest('hex'); assert.equal(length, file.bytes); assert.equal(sum, file.sha256);
  files.push({ path: file.path, bytes: length, sha256: sum });
}
const updatedNotice = Buffer.concat([notice, Buffer.from('\n\n'), append]);
await writeFile(path.join(payload, 'notices.txt'), updatedNotice);
files.push({ path: 'notices.txt', bytes: updatedNotice.length, sha256: digest(updatedNotice) });
assert.equal(files.length, 15);
await writeFile(path.join(output, 'DELIVERY.json'), JSON.stringify({ status: 'PREPARED_ONLY_NOT_DEPLOYED',
  sourceManifestSha256: digest(sourceBytes), baseNoticeSha256: digest(notice), files,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), preservedHfFiles: spec.preservedFiles }, null, 2) + '\n');
console.log(JSON.stringify({ files: files.length, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), deployed: false }));
