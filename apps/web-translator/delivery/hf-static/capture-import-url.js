// Inlined into the existing main bundle; only the owned HF capture module is signed.
function hfCaptureImportURL() {
  const url = new URL('./capture-Bh2ZntkC.js', import.meta.url);
  const origin = 'https://dar4med-med-partners-translator-test.static.hf.space';
  if (location.origin === origin && url.origin === origin &&
      url.pathname === '/assets/capture-Bh2ZntkC.js' && !url.search && !url.hash) {
    const sign = new URL(location.href).searchParams.get('__sign');
    if (sign) url.searchParams.set('__sign', sign);
  }
  return url.href;
}
