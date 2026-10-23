import { cacheNamesForPath } from "./installation.ts";

export function serviceWorkerSource(version: string, files: string[]): string {
  return `const cacheNamesForPath = ${cacheNamesForPath.toString()};
const scope = new URL('./', self.location.href).pathname;
const names = cacheNamesForPath(scope);
const CACHE = names.shellPrefix + '${version}';
const FILES = ${JSON.stringify(files.map((f) => "./" + f))};
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
`;
}
