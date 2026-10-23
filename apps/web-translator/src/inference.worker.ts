/// <reference lib="webworker" />
import { env, pipeline } from "@huggingface/transformers";
import { modelCacheName, artifactUrl } from "./cache.ts";
import { LANGUAGES, route, type Lang, type Model } from "./core.ts";

type Pipe = { dispose(): Promise<void> } & ((
  input: string | Float32Array,
  options: Record<string, unknown>,
) => Promise<any>);
const createPipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>,
) => Promise<Pipe>;
let asr: Pipe | null = null;
let translator: Pipe | null = null;
let translationId = "";
let models: Model[] = [];
let busy = false;

async function initialize(base: string, catalog: Model[], speech: boolean) {
  models = catalog;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = new URL("models/", base).href;
  env.useBrowserCache = false;
  env.useCustomCache = true;
  const cache = await caches.open(modelCacheName(base));
  const allowed = new Set(
    models.flatMap((m) => m.files.map((f) => artifactUrl(base, m, f))),
  );
  env.customCache = {
    async match(request: RequestInfo | URL) {
      const url =
        typeof request === "string"
          ? request
          : request instanceof URL
            ? request.href
            : request.url;
      if (!allowed.has(url)) return undefined;
      const result = await cache.match(url);
      if (!result)
        throw new Error(
          "Brak pobranego pliku modelu. Przygotuj pakiet ponownie.",
        );
      return result;
    },
    async put() {
      /* Models are written only by the SHA-256 verified downloader. */
    },
  };
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.wasmPaths = new URL("runtime/", base).href;
  }
  // CPU/WASM is deliberate: one portable baseline, no WebGPU requirement.
  if (speech)
    asr = await createPipeline("automatic-speech-recognition", "asr", {
      dtype: "q8",
      device: "wasm",
    });
}

async function translate(
  text: string,
  source: Lang,
  target: Lang,
): Promise<string> {
  for (const model of route(source, target, models)) {
    if (translationId !== model.id) {
      await translator?.dispose();
      translator = null;
      translationId = "";
      translator = await createPipeline("translation", model.id, {
        dtype: "q8",
        device: "wasm",
        session_options: { graphOptimizationLevel: "basic" },
      });
      translationId = model.id;
    }
    const output = await (translator as any)(model.prefix + text, {
      max_new_tokens: 192,
      num_beams: 1,
    });
    text = output[0].translation_text.trim();
    if (!text) throw new Error("Model nie zwrócił tłumaczenia.");
  }
  return text;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  if (busy) {
    self.postMessage({ id, error: "Silnik przetwarza poprzednią wypowiedź." });
    return;
  }
  busy = true;
  try {
    let result: unknown;
    const began = performance.now();
    if (type === "init") await initialize(data.base, data.models, data.speech);
    else if (type === "translate")
      result = { text: await translate(data.text, data.source, data.target) };
    else if (type === "recognize") {
      if (!asr) throw new Error("Rozpoznawanie mowy nie jest gotowe.");
      const output = await (asr as any)(data.audio, {
        language: LANGUAGES[data.source as Lang].asr,
        task: "transcribe",
        max_new_tokens: 128,
        return_timestamps: false,
      });
      result = { text: output.text.trim() };
    } else throw new Error("Nieznane polecenie silnika.");
    self.postMessage({ id, result, ms: Math.round(performance.now() - began) });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    busy = false;
  }
};
