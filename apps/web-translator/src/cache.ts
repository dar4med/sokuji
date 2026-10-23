import type { Artifact, Model } from "./core.ts";
export const MODEL_CACHE = "medpartners-models-v1";
const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export const artifactUrl = (base: string, model: Model, file: Artifact) =>
  new URL(`models/${model.id}/${file.path}`, base).href;

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

/** Download only the selected pair; inspect the hash before any file is used. */
export async function prepareModels(
  base: string,
  models: Model[],
  signal: AbortSignal,
  progress: (done: number, total: number, cached: boolean) => void,
): Promise<void> {
  if (!("caches" in globalThis))
    throw new Error(
      "Przeglądarka nie udostępnia pamięci modeli. Otwórz aplikację przez HTTPS poza trybem prywatnym.",
    );
  const cache = await caches.open(MODEL_CACHE);
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
        const fetched = await fetch(url, {
          signal,
          credentials: "omit",
          cache: "no-store",
        });
        if (!fetched.ok || !fetched.body)
          throw new Error(
            `Nie można pobrać ${model.id}/${file.path} (HTTP ${fetched.status}).`,
          );
        const reader = fetched.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          received += result.value.byteLength;
          if (received > file.bytes) {
            await reader.cancel();
            throw new Error("Serwer zwrócił zbyt duży plik modelu.");
          }
          chunks.push(result.value);
          progress(done + received, total, false);
        }
        const buffer = await new Blob(chunks as BlobPart[]).arrayBuffer();
        await verifyArtifact(buffer, file);
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
  const cache = await caches.open(MODEL_CACHE);
  let bytes = 0;
  for (const model of models)
    for (const file of model.files) {
      if (await cache.match(artifactUrl(base, model, file)))
        bytes += file.bytes;
    }
  return bytes;
}
