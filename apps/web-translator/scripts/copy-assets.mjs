import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
await cp(path.join(root, "licenses"), path.join(root, "public/licenses"), { recursive: true });
await cp(path.join(root, "LICENSE"), path.join(root, "public/licenses/APPLICATION-MIT.txt"));
await mkdir(path.join(root, "public/runtime"), { recursive: true });
await mkdir(path.join(root, "public/vad"), { recursive: true });
for (const file of await readdir(
  path.join(root, "node_modules/onnxruntime-web/dist"),
)) {
  if (
    ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"].includes(file)
  ) {
    await cp(
      path.join(root, "node_modules/onnxruntime-web/dist", file),
      path.join(root, "public/runtime", file),
    );
  }
}
for (const file of ["silero_vad_v5.onnx", "vad.worklet.bundle.min.js"]) {
  await cp(
    path.join(root, "node_modules/@ricky0123/vad-web/dist", file),
    path.join(root, "public/vad", file),
  );
}
console.log("Local ONNX runtimes, Silero VAD and AudioWorklet copied.");
const notices = [
  "Rozmowa — Stichting Med Partners. Independent prototype; application source: MIT.\nNo source code from the surrounding Sokuji application is imported.\n",
];
const lock = JSON.parse(
  await readFile(path.join(root, "package-lock.json"), "utf8"),
);
for (const [location, metadata] of Object.entries(lock.packages)) {
  if (!location || metadata.dev) continue;
  const folder = path.join(root, location);
  let files;
  try {
    files = await readdir(folder);
  } catch {
    continue;
  } // Optional platform packages may be absent.
  const pkg = JSON.parse(
    await readFile(path.join(folder, "package.json"), "utf8"),
  );
  notices.push(
    `${pkg.name} ${pkg.version}: ${pkg.license}\n${pkg.homepage || JSON.stringify(pkg.repository || "")}`,
  );
  for (const file of files)
    if (/^(LICENSE|COPYING|NOTICE|ThirdPartyNotices)([.-]|$)/i.test(file)) {
      notices.push(await readFile(path.join(folder, file), "utf8"));
    }
}
notices.push(
  "Silero VAD model: MIT, Copyright Silero Team. See licenses/SILERO-MIT.txt.\n",
);
for (const file of [
  "LICENSE",
  "licenses/SILERO-MIT.txt",
  "licenses/APACHE-2.0.txt",
  "licenses/ONNX-MIT.txt",
  "licenses/ONNX-THIRD-PARTY.txt",
  "licenses/VAD-ISC.txt",
]) {
  notices.push(await readFile(path.join(root, file), "utf8"));
}
try {
  const manifest = JSON.parse(
    await readFile(path.join(root, "models.lock.json"), "utf8"),
  );
  for (const model of manifest.models)
    notices.push(
      `${model.id}: ${model.repo} @ ${model.revision}\nBase: ${model.base}\nLicense: ${model.license}\nhttps://huggingface.co/${model.repo}/tree/${model.revision}\n${model.id === "en-pl" ? "Locally derived: tokenizer conversion and ONNX Runtime dynamic int8 quantization. Source and recipe retained.\n" : ""}`,
    );
} catch {
  notices.push("Models have not yet been prepared.");
}
await writeFile(path.join(root, "public/notices.txt"), notices.join("\n\n").split(/\r?\n/).map(line => line.trimEnd()).join("\n"));
