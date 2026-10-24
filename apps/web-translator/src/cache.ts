import type { Artifact, Model } from "./core.ts";
import { installationBase, modelCacheName, modelPath } from "./installation.ts";
export { modelCacheName } from "./installation.ts";
export const MODEL_DOWNLOAD_IDLE_MS = 30_000;
const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export function artifactUrl(base: string, model: Model, file: Artifact): string {
  const verified = installationBase(base);
  const url = new URL(modelPath(model.id, file.path), verified);
  if (url.origin !== verified.origin || !url.pathname.startsWith(verified.pathname + "models/"))
    throw new Error("Plik modelu poza katalogiem aplikacji.");
  return url.href;
}

export async function verifyArtifact(
  buffer: ArrayBuffer,
  file: Artifact,
): Promise<void> {
  if (
    buffer.byteLength !== file.bytes ||
    hex(await crypto.subtle.digest("SHA-256", buffer)) !== file.sha256
  ) {
    throw new Error(
      `Nieprawidłowy plik modelu: ${file.path}. Usuń pakiety i pobierz ponownie.`,
    );
  }
}

/** The deadline covers waiting for headers/chunks, not total file transfer time. */
async function downloadArtifact(
  url: string,
  file: Artifact,
  signal: AbortSignal,
  progress: (bytes: number) => void,
  idleMs: number,
): Promise<ArrayBuffer> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new Error(
      `Pobieranie przerwane: brak danych przez ${idleMs / 1000} s. Sprawdź połączenie i ponów tłumaczenie lub rozmowę. Poprawnie pobrane pliki pozostają zapisane.`,
    )), idleMs);
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;
  let aborted!: () => void;
  const interrupted = new Promise<never>((_resolve, reject) => {
    aborted = () => {
      void reader?.cancel(controller.signal.reason).catch(() => {});
      reject(controller.signal.reason);
    };
    controller.signal.addEventListener("abort", aborted, { once: true });
  });
  arm();
  try {
    const fetched = await Promise.race([fetch(url, {
      signal: controller.signal, credentials: "same-origin", redirect: "error", cache: "no-store",
    }), interrupted]);
    if (!fetched.ok || !fetched.body)
      throw new Error(`Nie można pobrać ${file.path} (HTTP ${fetched.status}).`);
    reader = fetched.body.getReader();
    arm();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const result = await Promise.race([reader.read(), interrupted]);
      controller.signal.throwIfAborted();
      if (result.done) break;
      received += result.value.byteLength;
      if (received > file.bytes) throw new Error("Serwer zwrócił zbyt duży plik modelu.");
      if (result.value.byteLength) arm();
      chunks.push(result.value);
      progress(received);
    }
    clearTimeout(timer!);
    complete = true;
    const buffer = await new Blob(chunks as BlobPart[]).arrayBuffer();
    await verifyArtifact(buffer, file);
    controller.signal.throwIfAborted();
    return buffer;
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", aborted);
    if (complete) reader?.releaseLock();
    else {
      controller.abort();
      void reader?.cancel().catch(() => {});
    }
  }
}

/** Download only the selected pair; inspect the hash before any file is used. */
export async function prepareModels(
  base: string,
  models: Model[],
  signal: AbortSignal,
  progress: (done: number, total: number, cached: boolean) => void,
  idleMs = MODEL_DOWNLOAD_IDLE_MS,
): Promise<void> {
  if (!("caches" in globalThis))
    throw new Error(
      "Przeglądarka nie udostępnia pamięci modeli. Otwórz aplikację przez HTTPS poza trybem prywatnym.",
    );
  // Validate the entire selection before any cache access or authenticated request.
  installationBase(base);
  for (const model of models) for (const file of model.files) artifactUrl(base, model, file);
  const cache = await caches.open(modelCacheName(base));
  const total = models.reduce(
    (n, m) => n + m.files.reduce((s, f) => s + f.bytes, 0),
    0,
  );
  let done = 0;
  for (const model of models)
    for (const file of model.files) {
      signal.throwIfAborted();
      const url = artifactUrl(base, model, file);
      let response = await cache.match(url);
      let cached = !!response;
      if (response) {
        try {
          await verifyArtifact(await response.clone().arrayBuffer(), file);
        } catch {
          await cache.delete(url);
          response = undefined;
          cached = false;
        }
      }
      if (!response) {
        const buffer = await downloadArtifact(url, file, signal,
          (received) => progress(done + received, total, false), idleMs);
        signal.throwIfAborted();
        await cache.put(
          url,
          new Response(buffer, {
            headers: {
              "Content-Type": file.path.endsWith(".json")
                ? "application/json"
                : "application/octet-stream",
            },
          }),
        );
      }
      done += file.bytes;
      progress(done, total, cached);
    }
  void navigator.storage?.persist?.().catch(() => false);
}

export async function cachedBytes(
  base: string,
  models: Model[],
): Promise<number> {
  if (!("caches" in globalThis)) return 0;
  const cache = await caches.open(modelCacheName(base));
  let bytes = 0;
  for (const model of models)
    for (const file of model.files) {
      if (await cache.match(artifactUrl(base, model, file)))
        bytes += file.bytes;
    }
  return bytes;
}
