import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
export function testMetadata() {
  return {
    startedAt: new Date().toISOString(),
    sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(),
    sourceDirty: !!execFileSync("git", ["status", "--porcelain", "--untracked-files=normal", "--", "."], { cwd, encoding: "utf8" }).trim(),
    node: process.version,
  };
}
