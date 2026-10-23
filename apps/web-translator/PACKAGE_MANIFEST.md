# Manifest prywatnego pakietu — etap 3

Archiwum: `translator-private-6532e6406b92.zip` — **331201715 B**.
SHA-256 ZIP: `028bc2b4ac237e9cec904becbdbdf62c208f4986187c19f2de3b48102984ad36`.
SHA-256 oryginalnego `MANIFEST.json`: `5ac6929cc65d0e0f07842a11f4f0a88a97b924e7446c1b8249b589fa2244a401`.
Testowany kod: `6532e6406b9291de0712dadd4b78435dab57d5c1`. Dokumentacja w archiwum: `afdc28190` (pełny SHA w SOURCE.json).

**74 pliki po wyodrębnieniu**, w tym poniższe 73 i sam MANIFEST.json. Ta tabela jest kopią dowodu, nie dodatkowym plikiem wewnątrz ZIP. Wyodrębnienie, CRC, komplet plików i wszystkie sumy zostały sprawdzone; modele ponownie zgodne z lockiem.

Cel zatwierdzony: `https://ai.lekarz.nl/translator-test/`. Wysyła się zawartość `payload/`, dopiero z rzeczywistą ochroną HTTPS Basic Auth i ograniczonym dostępem. **Nie wykonano uploadu.** `.htaccess` pakietu ma deny-all; nie zawiera poświadczeń ani aktywnej fikcyjnej ścieżki AuthUserFile.

Brak natywnego mechanizmu załącznika/transferu w tej sesji. Archiwum i JSON manifest są zachowane w `/workspace/artifacts/sokuji-stage3/`; nie przedstawiamy tej ścieżki jako potwierdzonego linku pobrania właściciela. Bez publikacji release lub usługi w obejściu.

| Plik w ZIP | Bajty | SHA-256 |
|---|---:|---|
| `PRIVATE_TESTING.md` | 11949 | `8f7a50ccb908cfe2314f9aa610ded6a3952eb5fcfebf78d3297c7ac3002e2b71` |
| `SOURCE.json` | 1130 | `f91b67d6b53607d30363f7d01310a3de1cf32572d5f601e1bb92fc02f3c29ed3` |
| `hosting/BASIC_AUTH.template.txt` | 1074 | `a34b9bf5539a78d46ec2211dae87ec3ce94f5c78b56154efd3ddf7b2fdd4cb59` |
| `payload/.htaccess` | 1183 | `a54708f4e6b4b2c26f937fcc845cf4a76b6a874a0ee4c6e34eb471cd944fd971` |
| `payload/assets/capture-B0Bee-Xt.js` | 69625 | `2c06f15e73fd712ed0897299a015382395d7e0808405e24c211ba7b65449925b` |
| `payload/assets/index-6Mmpehg4.css` | 6463 | `5c4f2bd1d41a144bb1c23a92425542e334b80b718d8794538986be7e1e393c47` |
| `payload/assets/index-BF7y0ORU.js` | 20877 | `d7cd7f6ea63d1b4a3fa00242a39df03ded53a491688c83c0410f3f6ac9d1068a` |
| `payload/assets/inference.worker-BTlV6rec.js` | 543851 | `0c32a9fe4fe046eae1064345169fc3e4479469d9e08d51570c76b7123e6a285d` |
| `payload/icon.svg` | 342 | `7e0e5652f64b1ed16ddae5d6169d0fcafd3e9767576b3302332189eb3f0cf133` |
| `payload/index.html` | 9490 | `5b77c42f82bdc94f0b3c126fbc72e8abb80a13a555ae0023c0b666dfd959e0f1` |
| `payload/licenses/APACHE-2.0.txt` | 11358 | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| `payload/licenses/APPLICATION-MIT.txt` | 1079 | `c75891ae7d0faea8f404fee69769615a512076f2c72b7956bcee6b986089b89e` |
| `payload/licenses/ONNX-MIT.txt` | 1073 | `2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c` |
| `payload/licenses/ONNX-THIRD-PARTY.txt` | 326866 | `e9e90971a8e75a9a8ac0c6412e29c1202d079998389915aa485f46c816c3b4cc` |
| `payload/licenses/SILERO-MIT.txt` | 1076 | `51c19c8be941a3fb00ccf58f0bf9053de9f7237a0b37327896eabad32dffe873` |
| `payload/licenses/VAD-ISC.txt` | 1896 | `239ebca4207803d3507124517c0dd6324c0d5cf73e1c486ade16bac1788f4a79` |
| `payload/licenses/models/asr/BASE_MODEL_CARD.md` | 19753 | `a7950543ae38196a44a508c26e3ad71154c145ed16e58bb4b197a88733538a60` |
| `payload/licenses/models/asr/MODEL_CARD.md` | 1161 | `1da6c5ffcb8f42565c695655768dd30c33acd4b92b0f56eecc76d16da9539a99` |
| `payload/licenses/models/asr/source.json` | 216 | `776ec08558c9eeb5594ff3dea1f85a4d87237c34c5f49deeee641e9c4e9c86ba` |
| `payload/licenses/models/en-nl/BASE_MODEL_CARD.md` | 817 | `00b767fc5410d3f4ea7524b5b2369f9484a4a48f61923fdfcc34778b56ac98cb` |
| `payload/licenses/models/en-nl/MODEL_CARD.md` | 572 | `cd85eb2a7485ba0b7d08fee18b6f31015ee4470991ae6774aec7d4ca1e6995c5` |
| `payload/licenses/models/en-nl/source.json` | 224 | `aba4b501e0b9622626954e27c1ddcb0e4fadaeca3973ec5fba6d117ef53459d9` |
| `payload/licenses/models/en-pl/BASE_MODEL_CARD.md` | 4232 | `9515219d9372bd036073e37c00e76ca941ef5d5270d9f3c7f1323b6f7b5b5bbb` |
| `payload/licenses/models/en-pl/MODEL_CARD.md` | 2274 | `cda1204aefb08fabac6c1f2c335703c62ace1ec4a6a5a917991a71015386edae` |
| `payload/licenses/models/en-pl/source.json` | 235 | `abe5ccbd485746b3cf9aff8c98054a4d0774eb9ef1f9bf8de6d2b6dd526995a1` |
| `payload/licenses/models/nl-en/BASE_MODEL_CARD.md` | 817 | `1f72ff04ce756b87551c8eac4da8613447f88bb62457a928693eee614d720ea9` |
| `payload/licenses/models/nl-en/MODEL_CARD.md` | 572 | `61d05ec561020775622c4696a7e4221ddaec29bf7d008e4bc01c60621571a13c` |
| `payload/licenses/models/nl-en/source.json` | 224 | `c3b978b89c885521c78ba137645a384f0aac221ca892398230f8ebf72e0fc804` |
| `payload/licenses/models/pl-en/BASE_MODEL_CARD.md` | 817 | `035144a87be5aa518d24622eb383cabadbdc4ca8f0bd51d586f920001958716c` |
| `payload/licenses/models/pl-en/MODEL_CARD.md` | 572 | `293106dce7e113215cbe50b914ffc50a84e829c8d4aac20f6bcd1848f432c90a` |
| `payload/licenses/models/pl-en/source.json` | 224 | `93f1eeee78d9a97c98b4ed4e524767fa978caa8e4471cb0fad6fd5733ea1c1b0` |
| `payload/manifest.webmanifest` | 269 | `6fba9d5db9fb904d12b2b5a4b4db60fa98fdb5a17c0474bfc180c97372d46891` |
| `payload/models/asr/added_tokens.json` | 2082 | `ce949fe720c14311cb6c446e69cfe340dc669d7b006077a6feed6ae571dd7e88` |
| `payload/models/asr/config.json` | 2248 | `2b2e4e519084e0ea028b19b153f95202735a971870d6844aa26e559edd292e94` |
| `payload/models/asr/generation_config.json` | 3716 | `68ac791fcb4999461a313472125042934656240ba1cba7d1c2627fcbb19ac24c` |
| `payload/models/asr/normalizer.json` | 52666 | `bf1c507dc8724ca9cf9903640dacfb69dae2f00edee4f21ceba106a7392f26dd` |
| `payload/models/asr/onnx/decoder_model_merged_quantized.onnx` | 30727765 | `6c0c125986b007d2e3734bec84c18bda0152071b90b87fadac6d7764499927a0` |
| `payload/models/asr/onnx/encoder_model_quantized.onnx` | 10124910 | `fd9d995b9dcb0520f0dbf6cf68651af639fc385f594d9d876e69ca2802dc438e` |
| `payload/models/asr/preprocessor_config.json` | 339 | `a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d` |
| `payload/models/asr/special_tokens_map.json` | 2194 | `e67ae3a0aaa99abcd9f187138e12db1f65c16a14761c50ef10eef2c174a7a691` |
| `payload/models/asr/tokenizer.json` | 2480466 | `27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566` |
| `payload/models/asr/tokenizer_config.json` | 282683 | `2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce` |
| `payload/models/en-nl/config.json` | 1376 | `3469caf791a6a038451e418d4254434087c94afc7d9676c03d38b9c64ce258c5` |
| `payload/models/en-nl/generation_config.json` | 293 | `d22743c9c80fd838a33581944bdbe6f86b1374ec5d851d954430dd3f2d2552d1` |
| `payload/models/en-nl/onnx/decoder_model_merged_quantized.onnx` | 61258735 | `5f8034fddc4cdcb6fa6c3b64a06e1cd9b1955c0c6dcd13e0e47610ab99ac4a99` |
| `payload/models/en-nl/onnx/encoder_model_quantized.onnx` | 53937565 | `0febb990f8ca8ed9fd3e0017dfcb55ec5293999f20ead81d2bb4370e9e3120ff` |
| `payload/models/en-nl/tokenizer.json` | 6433167 | `c6b55d9ac70b2a566f0307c6f80d3136fb839ed8e70bb16186324747df58668b` |
| `payload/models/en-nl/tokenizer_config.json` | 280 | `75fc8adb60ba4b1d9fd242e0c73e1e38e9571e6822a2601ab78dd917fddaadfe` |
| `payload/models/en-pl/config.json` | 1311 | `697e0b5cf9ddf67225a07f5620d0f7fab374098f5b7efe23cecc598a5af3b821` |
| `payload/models/en-pl/generation_config.json` | 288 | `d8e9eb84f72d481769c5d43c4670950410a88cfcdae148333b5b2bc2a57ba3f5` |
| `payload/models/en-pl/onnx/decoder_model_merged_quantized.onnx` | 56713441 | `2bb33f0816ff2560065765fcef89760ecdb382d9ef17e6d51479611de99ef534` |
| `payload/models/en-pl/onnx/encoder_model_quantized.onnx` | 49586951 | `07005509aee185871eaf3dca95b6aeb4b3477cdd38d3a9d193368a357340677f` |
| `payload/models/en-pl/tokenizer.json` | 3576054 | `6a5fdc5c916764fe2f404945aa296ac20d285cf21a02e5d28642a1018418612f` |
| `payload/models/en-pl/tokenizer_config.json` | 849 | `38247cba4535951dd2c86c8470a0bff11990463e2610388f920cb38293c825f5` |
| `payload/models/nl-en/config.json` | 1376 | `e03f36d5475954f1c09b08d0da68d6ea06a051e299a399e740554ed768d2a99c` |
| `payload/models/nl-en/generation_config.json` | 293 | `b11b1ae60dbb7656d021197a8883e81004dbdb74652df9d113f2efe2ca0dd974` |
| `payload/models/nl-en/onnx/decoder_model_merged_quantized.onnx` | 61258736 | `ad4df9a08f16952c0d9ee06807f54d62fcd07a9109c2c0b8ea05a4422d7bf4d7` |
| `payload/models/nl-en/onnx/encoder_model_quantized.onnx` | 53937566 | `7b8b1e9071bed8e2394e3bd2f65b952700b1dd1293d087141134c8bac018653b` |
| `payload/models/nl-en/tokenizer.json` | 6433167 | `c6b55d9ac70b2a566f0307c6f80d3136fb839ed8e70bb16186324747df58668b` |
| `payload/models/nl-en/tokenizer_config.json` | 280 | `7e7b5a6712709169fe3bcd7fe1bfb851310e09b4ef70a7e39b176de30e420657` |
| `payload/models/pl-en/config.json` | 1376 | `98ccffdad4d25169e4621b05b70824b93855fcc1ac9e917a6faef0ead4d6c799` |
| `payload/models/pl-en/generation_config.json` | 293 | `58d0f9d875ca857930d2e8425c7dd093eef4799d56e6ca94bc067650d001248d` |
| `payload/models/pl-en/onnx/decoder_model_merged_quantized.onnx` | 59402168 | `9ad9da5bce473ca06a9b0a3dbf0793675827e5668ab501e5dc65dac8cecd93ba` |
| `payload/models/pl-en/onnx/encoder_model_quantized.onnx` | 52095390 | `2416eb3c6db52a2d116539bf673b596e6a3d1453153b17778e85c9f55249c832` |
| `payload/models/pl-en/tokenizer.json` | 6118576 | `788e7e69a1dcb862ced197e440581bfcb672b37173dd0c5ff55649c7c8394f74` |
| `payload/models/pl-en/tokenizer_config.json` | 280 | `d29a00bce5fa370984ef9bd8c612625b90d9a4843cffd27c067fde320080dfe0` |
| `payload/models-manifest.json` | 7634 | `e502daddf85dc5ab91338cf2d90b237306ff482cc89aafa0c300094e96c3d489` |
| `payload/notices.txt` | 450325 | `fe5ad0cd437239601e278732db6497e067786f67129a59c0fa1856f2cddea9c2` |
| `payload/runtime/ort-wasm-simd-threaded.mjs` | 20856 | `30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8` |
| `payload/runtime/ort-wasm-simd-threaded.wasm` | 11210254 | `71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4` |
| `payload/sw.js` | 2839 | `f3e388828a491e999e9c47e91ac3e370b0475fc3868b9ed0e279e566af293bb9` |
| `payload/vad/silero_vad_v5.onnx` | 2327524 | `2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f` |
| `payload/vad/vad.worklet.bundle.min.js` | 2480 | `8a48fdc7429948a2fde3d29a84bb1a64c1f67b4ba578ccaa7548b7f989f06a74` |
