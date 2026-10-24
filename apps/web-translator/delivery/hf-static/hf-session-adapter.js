// HF-host-only transport compatibility. No credentials, URLs or bodies logged.
(() => {
  const origin = 'https://dar4med-med-partners-translator-test.static.hf.space';
  const cdn = 'https://us.aws.cdn.hf.co';
  if (location.origin !== origin || window.__hfDownloadAdapterInstalled) return;
  window.__hfDownloadAdapterInstalled = true;
  const originalFetch = window.fetch;
  function modelPath(path) {
    const parts = path.split('/');
    return parts.length >= 4 && parts[0] === '' && parts[1] === 'models' &&
      /^[a-z]+(?:-[a-z]+)*$/.test(parts[2]) &&
      parts.slice(3).every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part));
  }
  window.fetch = function (input, init) {
    // The production downloader uses a string URL + explicit init. All other
    // callers, Request objects, headers and non-GET requests remain untouched.
    if ((typeof input !== 'string' && !(input instanceof URL)) || !init ||
        init.redirect !== 'error' || init.credentials !== 'same-origin' ||
        (init.method !== undefined && (typeof init.method !== 'string' || init.method.toUpperCase() !== 'GET')) || init.body != null ||
        init.headers !== undefined) return Reflect.apply(originalFetch, this, arguments);
    let requested;
    try { requested = new URL(input, document.baseURI); }
    catch { return Reflect.apply(originalFetch, this, arguments); }
    if (requested.origin !== origin || requested.username || requested.password ||
        requested.search || requested.hash || !modelPath(requested.pathname))
      return Reflect.apply(originalFetch, this, arguments);
    return Reflect.apply(originalFetch, this, [input, { ...init, redirect: 'follow' }]).then(response => {
      let final;
      try { final = new URL(response.url); } catch { /* Rejected below. */ }
      const allowed = final && !final.username && !final.password &&
        ((final.origin === origin && final.pathname === requested.pathname) ||
         (final.origin === cdn && final.pathname.startsWith('/xet-bridge-us/')));
      if (!allowed || response.type === 'opaque' || response.type === 'opaqueredirect') {
        void response.body?.cancel().catch(() => {});
        throw new Error('HF zwrócił model z niezatwierdzonego adresu. Pobieranie zatrzymano.');
      }
      return response; // Existing length, SHA-256, timeout and cache checks still apply.
    });
  };
})();

(() => {
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
      fail('import zweryfikowanego MJS z blob nie powiódł się. Sprawdź CSP strony; polityki nie zmieniono.');
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

// Private HF session context stays in memory and on the exact owned worker URL.
(() => {
  const origin = 'https://dar4med-med-partners-translator-test.static.hf.space';
  if (location.origin !== origin || window.__medPartnersHfSessionInstalled) return;
  window.__medPartnersHfSessionInstalled = true;
  let runtime;
  window.__medPartnersHfRuntimePaths = () => {
    // A failure can be retried; a verified Blob is retained for this page lifetime.
    if (!runtime) runtime = hfWasmPaths(origin + '/').catch(error => { runtime = undefined; throw error; });
    return runtime;
  };
  const NativeWorker = window.Worker;
  window.Worker = new Proxy(NativeWorker, {
    construct(target, args, newTarget) {
      const [input, options] = args;
      if (typeof input === 'string' || input instanceof URL) {
        let requested;
        try { requested = new URL(input, document.baseURI); } catch { /* Native validation below. */ }
        if (requested && requested.origin === origin && !requested.username && !requested.password &&
            requested.pathname === '/assets/inference.worker-DK3oltoU.js' && !requested.search && !requested.hash) {
          const sign = new URL(location.href).searchParams.get('__sign');
          if (sign) {
            requested.searchParams.set('__sign', sign);
            return Reflect.construct(target, [requested, options], newTarget);
          }
        }
      }
      return Reflect.construct(target, args, newTarget);
    },
  });
})();

})();
