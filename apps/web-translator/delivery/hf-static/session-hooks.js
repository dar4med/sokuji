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
