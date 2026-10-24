"""Reproduce the frozen public FLEURS subset; no dataset/model package required."""
from pathlib import Path
import hashlib
import json
import os
import struct
import tarfile
import urllib.request

APP = Path(__file__).resolve().parents[1]
MANIFEST = APP / 'research/natural-asr/CORPUS.json'
OUT = Path(os.environ.get('NATURAL_ASR_DIR', '/workspace/artifacts/natural-asr')).resolve()
assert not OUT.is_relative_to(APP.parents[1]), 'Keep research audio outside the repository'
OUT.mkdir(parents=True, exist_ok=True)
corpus = json.loads(MANIFEST.read_text())
identity = dict(corpus); identity.pop('corpusSha256')
assert hashlib.sha256(json.dumps(identity, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == corpus['corpusSha256']

def sha(data): return hashlib.sha256(data).hexdigest()
def float32_data(wav):
    assert wav[:4] == b'RIFF' and wav[8:12] == b'WAVE'
    offset = 12; fmt = None; body = None
    while offset + 8 <= len(wav):
        tag = wav[offset:offset + 4]; size = struct.unpack_from('<I', wav, offset + 4)[0]
        chunk = wav[offset + 8:offset + 8 + size]
        if tag == b'fmt ': fmt = struct.unpack_from('<HHIIHH', chunk)
        if tag == b'data': body = chunk
        offset += 8 + size + size % 2
    assert fmt and fmt[0] == 3 and fmt[1] == 1 and fmt[2] == 16000 and fmt[5] == 32
    assert body is not None
    return body

for config in ['pl_pl', 'nl_nl']:
    wanted = {}
    for sample in corpus['samples']:
        if sample['languageCode'] != config[:2]: continue
        wav, pcm = OUT / sample['wavFile'], OUT / sample['pcmFile']
        if wav.exists() and pcm.exists() and sha(wav.read_bytes()) == sample['audioSha256'] and sha(pcm.read_bytes()) == sample['pcmSha256']: continue
        wanted[sample['basename']] = sample
    if not wanted: continue
    url = f"https://huggingface.co/datasets/google/fleurs/resolve/{corpus['revision']}/data/{config}/audio/test.tar.gz"
    with urllib.request.urlopen(url, timeout=60) as response:
        with tarfile.open(fileobj=response, mode='r|gz') as archive:
            for member in archive:
                key = Path(member.name).name
                if key not in wanted or not member.isfile(): continue
                sample = wanted.pop(key); assert member.size == sample['audioBytes']
                raw = archive.extractfile(member).read(); assert sha(raw) == sample['audioSha256']
                data = float32_data(raw); assert sha(data) == sample['pcmSha256']
                assert len(data) == sample['num_samples'] * 4
                wav, pcm = OUT / sample['wavFile'], OUT / sample['pcmFile']; wav.parent.mkdir(parents=True, exist_ok=True)
                wav.write_bytes(raw); pcm.write_bytes(data)
                if not wanted: break
    assert not wanted, 'Frozen sample missing from pinned archive'
(OUT / 'CORPUS.json').write_bytes(MANIFEST.read_bytes())
print('Verified12 frozen human WAV/Float32 pairs; no resampling, TTS or transcript changes')
