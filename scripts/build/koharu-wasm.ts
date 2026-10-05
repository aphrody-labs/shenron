// SPDX-License-Identifier: Apache-2.0
/**
 * The site's Koharu editor imports the wasm-pack output of `crates/koharu-canvas`
 * (`packages/koharu/src/wasm/`), which is generated and ignored by Git: a clean checkout
 * cannot bundle the site until it exists. Site builds call `ensureKoharuWasm()` first.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
export const KOHARU_WASM = join(ROOT, "packages/koharu/src/wasm/koharu_canvas.js");

export function ensureKoharuWasm(): void {
  if (existsSync(KOHARU_WASM)) return;
  console.log("▶ koharu-canvas wasm absent: bun run --filter @shenron/koharu build:wasm");
  const build = Bun.spawnSync(
    [process.execPath, "run", "--filter", "@shenron/koharu", "build:wasm"],
    { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] },
  );
  if (build.exitCode !== 0 || !existsSync(KOHARU_WASM)) {
    throw new Error(
      "koharu-canvas wasm build failed: wasm-pack and the wasm32-unknown-unknown Rust target are required",
    );
  }
}
