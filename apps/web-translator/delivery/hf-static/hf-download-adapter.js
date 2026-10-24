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
