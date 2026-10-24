"""Overlay only rebuilt main/capture, preserving all three reviewed HF session fixes."""
from pathlib import Path
import hashlib
import json
import re

HERE = Path(__file__).resolve().parent
APP = HERE.parents[1]
OUT = HERE / 'audio-update'
OUT.mkdir(exist_ok=True)
assets = APP / 'dist/assets'
index_path, = assets.glob('index-*.js')
capture_path, = assets.glob('capture-*.js')
worker_path, = assets.glob('inference.worker-*.js')
assert hashlib.sha256(worker_path.read_bytes()).hexdigest() == 'a1a7e6a143df3f5c25916b405aaaa63a9cce5d484de59cc03d2b3270ade6ccd0', 'Do not replace the deployed HF worker'
assert hashlib.sha256((assets / 'index-6Mmpehg4.css').read_bytes()).hexdigest() == '5c4f2bd1d41a144bb1c23a92425542e334b80b718d8794538986be7e1e393c47'
capture = capture_path.read_text()
pattern = r'onnxWASMBasePath:new URL\(`runtime/`,([a-zA-Z_$][\w$]*)\)\.href'
assert len(re.findall(pattern, capture)) == 1
capture = re.sub(pattern, r'onnxWASMBasePath:await hfCapturePaths(\1)', capture)
# Exact reviewed MAIN Blob path helper from c310509.
previous = (HERE / 'capture-Bh2ZntkC.js').read_text()
assert hashlib.sha256(previous.encode()).hexdigest() == 'f5ef0856feb88b7b661dc88915f7b63469db44ad6af777640e416db767035ac6'
capture += '\n' + previous[previous.index('async function hfCapturePaths(base)'):]
index = index_path.read_text()
before = 'import(`./' + capture_path.name + '`)'
assert index.count(before) == 1
index = index.replace(before, 'import(hfCaptureImportURL())', 1)
index += '\n' + (HERE / 'capture-import-url.js').read_text()
files = {}
for name, text in [('capture-Bh2ZntkC.js', capture), ('index-CJ_k8XCq.js', index)]:
    data = text.encode(); (OUT / name).write_bytes(data)
    files['assets/' + name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
preserved = {
    'assets/inference.worker-DK3oltoU.js': 'd6fbb7329848723c4979700a88f1361e6c32b8140fa7b5758e548a9a3b8066dc',
    'hf-session-adapter.js': '0da02a6f4e0a4db71112e64e6c463d0833a56a8b17a7a3647b33cf988af8cedc',
}
(OUT / 'PATCH.json').write_text(json.dumps({
    'files': files, 'preservedFiles': preserved,
    'baseFiles': {'assets/capture-Bh2ZntkC.js': 'f5ef0856feb88b7b661dc88915f7b63469db44ad6af777640e416db767035ac6',
                  'assets/index-CJ_k8XCq.js': 'ed8e48ab178b39cc0fa336ea48c3a95c3a03d695fcc388226a9dc2fbe4a77cbe'},
    'modelsChanged': False, 'runtimeFilesChanged': False, 'htmlChanged': False, 'asrOptionsChanged': False,
    'hfFixesPreserved': ['verified worker Blob+explicit WASM', 'Worker __sign in unchanged adapter',
                        'MAIN verified Blob+explicit WASM', 'capture import __sign'],
}, indent=2) + '\n')
print(json.dumps(files, indent=2))
