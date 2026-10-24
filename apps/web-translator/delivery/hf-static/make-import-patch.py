"""Replace exactly one capture import in the pinned precompiled main bundle."""
from pathlib import Path
import hashlib
import json

HERE = Path(__file__).resolve().parent
name = 'index-CJ_k8XCq.js'
original = (HERE.parent / 'local-ui-update/payload/assets' / name).read_bytes()
expected = '572ab3cf8cd5cd840f2e6c204688df8e658add1f395f3d05a021c588ac4a91f1'
assert hashlib.sha256(original).hexdigest() == expected
before = 'import(`./capture-Bh2ZntkC.js`)'
text = original.decode()
assert text.count(before) == 1
patched = (text.replace(before, 'import(hfCaptureImportURL())', 1) + '\n' + (HERE / 'capture-import-url.js').read_text()).encode()
(HERE / name).write_bytes(patched)
(HERE / 'IMPORT-PATCH.json').write_text(json.dumps({
    'file': name, 'baseSha256': expected, 'replacementCount': 1,
    'bytes': len(patched), 'sha256': hashlib.sha256(patched).hexdigest(),
    'requiredSessionPatch': 'c3105095e4ff2e9493f77dd1791ae128501e719d',
    'modelsChanged': False, 'runtimeFilesChanged': False, 'audioWorkletChanged': False,
}, indent=2) + '\n')
print(hashlib.sha256(patched).hexdigest(), len(patched))
