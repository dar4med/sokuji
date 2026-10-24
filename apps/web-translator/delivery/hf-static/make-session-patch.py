"""Generate a small HF-only overlay from pinned precompiled files; no build/download."""
from pathlib import Path
import hashlib
import json

HERE = Path(__file__).resolve().parent
HOST = 'https://dar4med-med-partners-translator-test.static.hf.space'
helper = (HERE / 'worker-runtime/hf-wasm-paths.js').read_text().replace('Sprawdź CSP workera', 'Sprawdź CSP strony')
hooks = (HERE / 'session-hooks.js').read_text()
# Keep the shared runtime helper private instead of exporting a new global symbol.
adapter = (HERE / 'hf-download-adapter.js').read_text() + '\n(() => {\n' + helper + '\n' + hooks + '\n})();\n'
(HERE / 'hf-session-adapter.js').write_text(adapter)
name = 'capture-Bh2ZntkC.js'
base = (HERE.parent / 'local-ui-update/payload/assets' / name).read_bytes()
base_hash = '90dff1b2cfbb71a7010def2f03a2eda2f998cb66eef47b590fe5b7aa1dee426f'
assert hashlib.sha256(base).hexdigest() == base_hash
before = 'onnxWASMBasePath:new URL(`runtime/`,e).href'
assert base.decode().count(before) == 1
capture = base.decode().replace(before, 'onnxWASMBasePath:await hfCapturePaths(e)', 1)
capture += '''\nasync function hfCapturePaths(base) {
  if (location.origin !== '%s') return new URL('runtime/', base).href;
  if (typeof window.__medPartnersHfRuntimePaths !== 'function')
    throw new Error('HF VAD: wymagany adapter sesji nie został załadowany.');
  return window.__medPartnersHfRuntimePaths();
}\n''' % HOST
(HERE / name).write_text(capture)
files = {}
for filename in ('hf-session-adapter.js', name):
    data = (HERE / filename).read_bytes()
    files[filename] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
(HERE / 'SESSION-PATCH.json').write_text(json.dumps({
    'sourceApplicationSha': '38d8c828b1dd521598a9263b747e62abba654029',
    'baseCaptureSha256': base_hash, 'captureReplacementCount': 1,
    'files': files, 'worker': 'worker-runtime/PATCH.json',
    'modelsChanged': False, 'runtimeFilesChanged': False,
}, indent=2) + '\n')
print(json.dumps(files, indent=2))
