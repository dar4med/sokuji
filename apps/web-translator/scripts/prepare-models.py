#!/usr/bin/env python3
"""Download pinned, licensed ONNX artifacts. Never uploads conversation data.

Run with .tools/model-tools/bin/python scripts/prepare-models.py.
EN→PL requires a tokenizer conversion and dynamic quantization (no training).
"""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
WORK = ROOT / ".model-work"
NOTICES = ROOT / "licenses/models"
COMMON = ["config.json", "generation_config.json", "tokenizer_config.json"]
GRAPHS = ["onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"]
SPECS = [
    dict(id="asr", repo="Xenova/whisper-tiny", revision="5332fcc35e32a33b86612b9a57a89be7906102b1", base="openai/whisper-tiny", source=None, target=None),
    dict(id="pl-en", repo="Xenova/opus-mt-pl-en", revision="aeaf0e003b045248c28a559a5ce6027b54ebdaba", base="Helsinki-NLP/opus-mt-pl-en", source="pl", target="en"),
    dict(id="en-nl", repo="Xenova/opus-mt-en-nl", revision="c3a0541231a7329b4492809fc2bd7ab7d2ceb0bc", base="Helsinki-NLP/opus-mt-en-nl", source="en", target="nl"),
    dict(id="nl-en", repo="Xenova/opus-mt-nl-en", revision="82c42d95d1508037cbe7172d85fd4e940a2f3584", base="Helsinki-NLP/opus-mt-nl-en", source="nl", target="en"),
    dict(id="en-pl", repo="TigreGotico/opus-mt-en-pl-onnx", revision="22ac61d6f7a5e58e0e2d0671a5dcff91b9c66f54", base="Helsinki-NLP/opus-mt-en-sla", source="en", target="pl"),
]


def read(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def download(spec, metadata, filename, destination):
    info = next((f for f in metadata["siblings"] if f["rfilename"] == filename), None)
    if not info:
        raise RuntimeError(f"Missing required file: {spec['repo']}/{filename}")
    expected = info.get("lfs", {}).get("sha256")
    if destination.exists() and destination.stat().st_size == info["size"]:
        data_hash = digest(destination)
        if expected and data_hash == expected:
            return
        if not expected:
            blob = destination.read_bytes()
            git_hash = hashlib.sha1(f"blob {len(blob)}\0".encode() + blob).hexdigest()
            if git_hash == info.get("blobId"):
                return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".part")
    url = f"https://huggingface.co/{spec['repo']}/resolve/{spec['revision']}/{filename}"
    print(f"Downloading {spec['id']}/{filename}: {info['size'] / 1e6:.1f} MB", flush=True)
    with urllib.request.urlopen(url, timeout=120) as response, temporary.open("wb") as output:
        shutil.copyfileobj(response, output, 1024 * 1024)
    if temporary.stat().st_size != info["size"]:
        raise RuntimeError(f"Wrong length for {filename}")
    if expected:
        if digest(temporary) != expected:
            raise RuntimeError(f"SHA-256 mismatch for {filename}")
    else:
        blob = temporary.read_bytes()
        actual = hashlib.sha1(f"blob {len(blob)}\0".encode() + blob).hexdigest()
        if actual != info["blobId"]:
            raise RuntimeError(f"Git blob mismatch for {filename}")
    temporary.replace(destination)


def convert_polish_tokenizer(folder, destination):
    """Preserve Marian's shared token IDs, using source SentencePiece scores.

    Target-only pieces remain in the decoder vocabulary but cannot win source
    segmentation. The browser test compares tokens against SentencePiece fixtures.
    """
    import sentencepiece as spm
    processor = spm.SentencePieceProcessor(model_file=str(folder / "source.spm"))
    vocab = json.loads((folder / "vocab.json").read_text())
    scores = {processor.id_to_piece(i): processor.get_score(i) for i in range(processor.get_piece_size())}
    ordered = sorted(vocab, key=vocab.get)
    special = ["</s>", "<unk>", "<pad>"]
    language_tokens = [t for t in ordered if t.startswith(">>") and t.endswith("<<")]
    added = [dict(id=vocab[t], content=t, special=True, single_word=False, lstrip=False, rstrip=False, normalized=False) for t in special + language_tokens]
    tokenizer = dict(
        version="1.0", truncation=None, padding=None, added_tokens=added,
        normalizer={"type": "Precompiled", "precompiled_charsmap": None},
        pre_tokenizer={"type": "Sequence", "pretokenizers": [{"type": "WhitespaceSplit"}, {"type": "Metaspace", "replacement": "▁", "add_prefix_space": True}]},
        post_processor={"type": "TemplateProcessing", "single": [{"Sequence": {"id": "A", "type_id": 0}}, {"SpecialToken": {"id": "</s>", "type_id": 0}}], "pair": [], "special_tokens": {"</s>": {"id": "</s>", "ids": [vocab["</s>"]], "tokens": ["</s>"]}}},
        decoder={"type": "Metaspace", "replacement": "▁", "add_prefix_space": True},
        model={"type": "Unigram", "unk_id": vocab["<unk>"], "vocab": [[t, scores.get(t, -100.0)] for t in ordered]},
    )
    write_json(destination / "tokenizer.json", tokenizer)
    sentences = ["Hello, how are you today?", "I would like a glass of water.", "The blue bicycle is next to the house.", "This is a fictional test, number 42."]
    fixtures = [{"text": ">>pol<< " + text, "ids": [vocab[">>pol<<"]] + [vocab.get(piece, vocab["<unk>"]) for piece in processor.encode(text, out_type=str)] + [vocab["</s>"]]} for text in sentences]
    write_json(ROOT / "tests/tokenizer-fixtures.json", fixtures)


def prepare(spec):
    url = f"https://huggingface.co/api/models/{spec['repo']}/revision/{spec['revision']}?blobs=true"
    metadata = json.loads(read(url))
    base = json.loads(read(f"https://huggingface.co/api/models/{spec['base']}"))
    license_id = metadata.get("cardData", {}).get("license") or base.get("cardData", {}).get("license")
    if license_id not in ("apache-2.0", "mit") or base.get("cardData", {}).get("license") not in ("apache-2.0", "mit"):
        raise RuntimeError(f"Unapproved license: {spec['repo']} {license_id}")
    destination = PUBLIC / "models" / spec["id"]
    destination.mkdir(parents=True, exist_ok=True)
    evidence = NOTICES / spec["id"]
    write_json(evidence / "source.json", {"repo": spec["repo"], "revision": spec["revision"], "base": spec["base"], "baseRevision": base["sha"], "license": license_id})
    for name, url in [("MODEL_CARD.md", f"https://huggingface.co/{spec['repo']}/resolve/{spec['revision']}/README.md"), ("BASE_MODEL_CARD.md", f"https://huggingface.co/{spec['base']}/resolve/{base['sha']}/README.md")]:
        # Preserve the document text; normalize line endings/trailing spaces only.
        (evidence / name).write_text("\n".join(line.rstrip() for line in read(url).decode().splitlines()).rstrip() + "\n")
    if spec["id"] == "en-pl":
        files = COMMON + ["source.spm", "vocab.json", "encoder_model.onnx", "decoder_model_merged.onnx"]
        folder = WORK / "en-pl"
        for filename in files:
            download(spec, metadata, filename, folder / filename)
        for filename in COMMON:
            shutil.copyfile(folder / filename, destination / filename)
        convert_polish_tokenizer(folder, destination)
        from onnxruntime.quantization import quantize_dynamic, QuantType
        old_manifest = json.loads((ROOT / "models.lock.json").read_text()) if (ROOT / "models.lock.json").exists() else {"models": []}
        old_model = next((m for m in old_manifest["models"] if m["id"] == "en-pl"), {})
        old_hashes = {f["path"]: f["sha256"] for f in old_model.get("files", [])}
        for source, target in [("encoder_model.onnx", GRAPHS[0]), ("decoder_model_merged.onnx", GRAPHS[1])]:
            output = destination / target
            output.parent.mkdir(exist_ok=True)
            if not output.exists() or old_hashes.get(target) != digest(output):
                print(f"Quantizing EN→PL {source}", flush=True)
                quantize_dynamic(str(folder / source), str(output), weight_type=QuantType.QUInt8, per_channel=False, extra_options={"EnableSubgraph": True, "MatMulConstBOnly": True})
                if target in old_hashes and digest(output) != old_hashes[target]:
                    raise RuntimeError(f"Derived artifact differs from the reviewed lock: {target}. Review tool versions before changing the lock.")
    else:
        files = COMMON + ["tokenizer.json"] + GRAPHS
        if spec["id"] == "asr":
            files += ["preprocessor_config.json"]
            # Required by Whisper's tokenizer normalization, if present.
            present = {f["rfilename"] for f in metadata["siblings"]}
            files += [f for f in ["normalizer.json", "added_tokens.json", "special_tokens_map.json"] if f in present]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda filename: download(spec, metadata, filename, destination / filename), files))
    records = []
    for file in sorted(destination.rglob("*")):
        if file.is_file() and not file.name.endswith(".part"):
            records.append(dict(path=file.relative_to(destination).as_posix(), bytes=file.stat().st_size, sha256=digest(file)))
    return dict(**spec, license=license_id, prefix=">>pol<< " if spec["id"] == "en-pl" else "", files=records)


if __name__ == "__main__":
    os.environ.setdefault("OMP_NUM_THREADS", "2")
    models = [prepare(spec) for spec in SPECS]
    manifest = {"version": 1, "models": models}
    write_json(ROOT / "models.lock.json", manifest)
    write_json(PUBLIC / "models-manifest.json", manifest)
    print("Verified all five models, including all six routes through English.", flush=True)
    for model in models:
        print(model["id"], sum(f["bytes"] for f in model["files"]) / 1e6, "MB", model["license"])
