import { defineConfig } from "vite";
import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serviceWorkerSource } from "./src/service-worker.ts";

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
      name: "dev-style-nonce",
      transformIndexHtml: {
        order: "pre",
        handler(html, context) {
          if (!context.server) return html;
          // Vite's CSS/HMR client reads this meta nonce. New value per HTML response;
          // no nonce or relaxed directive is emitted by the production build.
          const nonce = randomBytes(24).toString("base64");
          return html
            .replace("style-src 'self'", `style-src 'self' 'nonce-${nonce}'`)
            .replace("<!--APP_STARTUP-->", `<meta property="csp-nonce" nonce="${nonce}"><!--APP_STARTUP-->`);
        },
      },
    },
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
        const source = serviceWorkerSource(version, files);
        await writeFile(path.join(directory, "sw.js"), source);
      },
    },
  ],
});
