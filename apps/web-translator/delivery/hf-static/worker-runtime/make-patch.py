"""Byte-preserving HF worker overlay. No compiler, model download or hosting."""
from pathlib import Path
import hashlib
import json

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
NAME = 'inference.worker-DK3oltoU.js'
original = (ROOT / 'local-ui-update/payload/assets' / NAME).read_bytes()
expected = 'a1a7e6a143df3f5c25916b405aaaa63a9cce5d484de59cc03d2b3270ade6ccd0'
assert hashlib.sha256(original).hexdigest() == expected
before = 'Rn.backends.onnx.wasm.wasmPaths=new URL(`runtime/`,e).href'
helper = (HERE / 'hf-wasm-paths.js').read_text().strip()
assert helper.startswith('//') and '\nasync function hfWasmPaths(base)' in helper
function = helper[helper.index('async function hfWasmPaths(base)'):]
after = 'Rn.backends.onnx.wasm.wasmPaths=await (' + function + ')(e)'
text = original.decode()
assert text.count(before) == 1
patched = text.replace(before, after, 1).encode()
(HERE / NAME).write_bytes(patched)
(HERE / 'PATCH.json').write_text(json.dumps({
    'worker': NAME, 'baseSha256': expected, 'bytes': len(patched),
    'sha256': hashlib.sha256(patched).hexdigest(), 'replacementCount': 1,
    'mjsBytes': 20856, 'mjsSha256': '30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8',
    'wasmChanged': False, 'modelsChanged': False, 'numThreads': 1, 'proxy': False,
    'sourceApplicationSha': '38d8c828b1dd521598a9263b747e62abba654029',
}, indent=2) + '\n')
print('One worker assignment replaced; models/WASM untouched.')
