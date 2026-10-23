import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const startup = readFileSync(new URL("./scripts/startup.js", import.meta.url), "utf8");
const startupHash = createHash("sha256").update(startup).digest("base64");
const allowStartup = (text: string) => text.replace(
  "script-src 'self' 'wasm-unsafe-eval'",
  `script-src 'self' 'wasm-unsafe-eval' 'sha256-${startupHash}'`,
);

const headers = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "X-Content-Type-Options": "nosniff",
};
export default defineConfig({
  base: "./",
  // One CPU runtime for both engines. Avoid bundling the unused WebGPU binary.
  resolve: {
    alias: [
      {
        find: /^onnxruntime-web(?:\/wasm)?$/,
        replacement: fileURLToPath(
          new URL(
            "./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs",
            import.meta.url,
          ),
        ),
      },
    ],
  },
  server: { headers },
  preview: { headers },
  build: { target: "es2022", sourcemap: false },
  worker: { format: "es" },
  plugins: [
    {
      name: "preview-startup",
      transformIndexHtml: {
        order: "pre",
        handler: (html) => allowStartup(html).replace(
          "<!--APP_STARTUP-->", `<script>${startup}</script>`,
        ),
      },
      async writeBundle(options) {
        const target = path.join(options.dir!, ".htaccess");
        await writeFile(target, allowStartup(await readFile(target, "utf8")));
      },
    },
    {
      name: "offline-shell",
      async writeBundle(options) {
        const directory = options.dir!;
        const files: string[] = [];
        async function collect(relative = "") {
          for (const entry of await readdir(path.join(directory, relative), {
            withFileTypes: true,
          })) {
            const file = path.posix.join(relative, entry.name);
            if (file === "models" || file === "sw.js") continue;
            if (entry.isDirectory()) await collect(file);
            else if (!file.startsWith(".")) files.push(file);
          }
        }
        await collect();
        const hash = createHash("sha256");
        for (const file of files.sort())
          hash.update(await readFile(path.join(directory, file)));
        const version = hash.digest("hex").slice(0, 16);
        const source = `const CACHE = 'medpartners-shell-${version}';
const FILES = ${JSON.stringify(files.map((f) => "./" + f))};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('medpartners-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const scope = new URL('./', self.location.href).pathname;
  if (new URL(event.request.url).pathname.startsWith(scope + 'models/')) {
    event.respondWith(caches.open('medpartners-models-v1').then(cache => cache.match(event.request, { ignoreVary: true })).then(hit => hit || fetch(event.request)));
    return;
  }
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request, { ignoreVary: true })).then(hit => hit || (event.request.mode === 'navigate' ? caches.open(CACHE).then(cache => cache.match('./index.html', { ignoreVary: true })) : null)).then(hit => hit || fetch(event.request)));
});
`;
        await writeFile(path.join(directory, "sw.js"), source);
      },
    },
  ],
});
