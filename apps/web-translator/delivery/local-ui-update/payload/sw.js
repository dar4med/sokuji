const cacheNamesForPath = function cacheNamesForPath(pathname) {
	if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(pathname)) throw new Error("Nieprawidłowy katalog instalacji.");
	const prefix = `medpartners-v2-${encodeURIComponent(pathname)}-`;
	return {
		models: `${prefix}models`,
		shellPrefix: `${prefix}shell-`
	};
};
const scope = new URL('./', self.location.href).pathname;
const names = cacheNamesForPath(scope);
const CACHE = names.shellPrefix + 'e2cf8068c19a6735';
const FILES = ["./assets/capture-Bh2ZntkC.js","./assets/index-6Mmpehg4.css","./assets/index-CJ_k8XCq.js","./assets/inference.worker-DK3oltoU.js","./icon.svg","./index.html","./licenses/APACHE-2.0.txt","./licenses/APPLICATION-MIT.txt","./licenses/ONNX-MIT.txt","./licenses/ONNX-THIRD-PARTY.txt","./licenses/SILERO-MIT.txt","./licenses/VAD-ISC.txt","./licenses/models/asr/BASE_MODEL_CARD.md","./licenses/models/asr/MODEL_CARD.md","./licenses/models/asr/source.json","./licenses/models/en-nl/BASE_MODEL_CARD.md","./licenses/models/en-nl/MODEL_CARD.md","./licenses/models/en-nl/source.json","./licenses/models/en-pl/BASE_MODEL_CARD.md","./licenses/models/en-pl/MODEL_CARD.md","./licenses/models/en-pl/source.json","./licenses/models/nl-en/BASE_MODEL_CARD.md","./licenses/models/nl-en/MODEL_CARD.md","./licenses/models/nl-en/source.json","./licenses/models/pl-en/BASE_MODEL_CARD.md","./licenses/models/pl-en/MODEL_CARD.md","./licenses/models/pl-en/source.json","./manifest.webmanifest","./models-manifest.json","./notices.txt","./runtime/ort-wasm-simd-threaded.mjs","./runtime/ort-wasm-simd-threaded.wasm","./vad/silero_vad_v5.onnx","./vad/vad.worklet.bundle.min.js"];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(names.shellPrefix) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(scope)) return;
  if (new URL(event.request.url).pathname.startsWith(scope + 'models/')) {
    event.respondWith(caches.match(event.request, { cacheName: names.models, ignoreVary: true }).then(hit => hit || fetch(event.request)));
    return;
  }
  // Read without open(): an old in-flight worker must not recreate a deleted shell.
  event.respondWith(caches.match(event.request, { cacheName: CACHE, ignoreVary: true }).then(hit => hit || (event.request.mode === 'navigate' ? caches.match(new URL('./index.html', self.location.href).href, { cacheName: CACHE, ignoreVary: true }) : null)).then(hit => hit || fetch(event.request)));
});
