// Inlined once into the HF-only precompiled worker; no application/model rebuild.
async function hfWasmPaths(base) {
  const root = new URL('runtime/', base);
  if (root.origin !== self.location.origin || root.pathname !== '/runtime/')
    throw new Error('HF ORT: nieprawidłowa baza lokalnego runtime.');
  const moduleURL = new URL('ort-wasm-simd-threaded.mjs', root);
  const expectedBytes = 20856;
  const expectedHash = '30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let reader;
  const fail = message => {
    const error = new Error('HF ORT: ' + message);
    error.hfOrtSafe = true;
    throw error;
  };
  try {
    const response = await fetch(moduleURL.href, {
      credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal,
    });
    if (!response.ok || !response.body) fail('pobranie MJS nie zwróciło poprawnego pliku.');
    const final = new URL(response.url);
    if (final.origin !== root.origin || final.pathname !== moduleURL.pathname)
      fail('MJS pochodzi z niezatwierdzonej ścieżki.');
    const mime = response.headers.get('content-type')?.split(';')[0].trim();
    if (!['application/javascript', 'text/javascript'].includes(mime)) fail('nieprawidłowy MIME pliku MJS.');
    reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > expectedBytes) fail('MJS przekracza przypięty rozmiar.');
      chunks.push(value);
    }
    const body = await new Blob(chunks).arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', body))]
      .map(value => value.toString(16).padStart(2, '0')).join('');
    if (bytes !== expectedBytes || hash !== expectedHash) fail('niezgodny rozmiar lub SHA-256 MJS.');
    const objectURL = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
    try {
      // Preflight the same URL ORT will import, without instantiating WASM yet.
      const imported = await import(objectURL);
      if (typeof imported.default !== 'function') fail('MJS nie eksportuje fabryki runtime.');
    } catch {
      URL.revokeObjectURL(objectURL);
      fail('import zweryfikowanego MJS z blob nie powiódł się. Sprawdź CSP workera; polityki nie zmieniono.');
    }
    // Keep the verified module URL for this worker's lifetime. An explicit WASM
    // URL is essential: relative resolution from a blob module would be invalid.
    return { mjs: objectURL, wasm: new URL('ort-wasm-simd-threaded.wasm', root).href };
  } catch (error) {
    controller.abort();
    void reader?.cancel().catch(() => {});
    if (error?.hfOrtSafe) throw error;
    throw new Error('HF ORT: fetch MJS nie powiódł się lub przekroczono czas.');
  } finally { clearTimeout(timer); }
}
