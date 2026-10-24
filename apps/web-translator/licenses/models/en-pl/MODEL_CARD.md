---
license: apache-2.0
base_model: Helsinki-NLP/opus-mt-en-sla
tags:
  - onnx
  - translation
library_name: transformers
language:
  - en
  - pl
---

# opus-mt-en-pl-onnx

ONNX export (fp32 + dynamic int8 quantized) of [`Helsinki-NLP/opus-mt-en-sla`](https://huggingface.co/Helsinki-NLP/opus-mt-en-sla), a Marian (en -> pl) translation model from the Helsinki-NLP OPUS-MT project.

**License:** apache-2.0 (inherited from the base model; verify at the source link above).

## Export

```
optimum-cli export onnx --model Helsinki-NLP/opus-mt-en-sla --task text2text-generation-with-past /home/miro/tmp/claude-1000/-home-miro/849a3674-94c9-4aa5-b1f9-e596235b0a36/scratchpad/opusmt-onnx/out/en-pl
```

Quantized to int8 with `onnxruntime.quantization.quantize_dynamic` (QUInt8 weights).

## File layout

```
./                      fp32 ONNX graphs (encoder_model.onnx, decoder_model.onnx, decoder_with_past_model.onnx) + tokenizer files
./int8/                 int8 dynamic-quantized ONNX graphs
```

fp32 size: ~818 MB | int8 size: ~365 MB

## Sanity check

Compared PyTorch (`MarianMTModel`) vs ONNX fp32 (`ORTModelForSeq2SeqLM`, num_beams=4, max_new_tokens=48) on 3 sentences. Match: 3/3.

- **src:** >>pol<< Hello, how are you today?
  - pytorch: Witam, jak się dziś miewasz?
  - onnx fp32: Witam, jak się dziś miewasz? (match)
- **src:** >>pol<< The weather is nice this morning.
  - pytorch: Pogoda jest dziś miła.
  - onnx fp32: Pogoda jest dziś miła. (match)
- **src:** >>pol<< I would like to order a coffee, please.
  - pytorch: Chciałbym zamówić kawę, proszę.
  - onnx fp32: Chciałbym zamówić kawę, proszę. (match)

int8 sample output (not gated, for reference only):
- Cześć, jak się dziś miewasz?

## Usage

```python
from optimum.onnxruntime import ORTModelForSeq2SeqLM
from transformers import AutoTokenizer

repo = "TigreGotico/opus-mt-en-pl-onnx"
tok = AutoTokenizer.from_pretrained(repo)
model = ORTModelForSeq2SeqLM.from_pretrained(repo)  # fp32; pass subfolder="int8" for the quantized graphs
inputs = tok("Hello, how are you?", return_tensors="pt")
out = model.generate(**inputs, num_beams=4, max_new_tokens=48)
print(tok.decode(out[0], skip_special_tokens=True))
```

Exported for the OVOS / TigreGotico offline translation stack.
