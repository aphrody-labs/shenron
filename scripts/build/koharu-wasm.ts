// SPDX-License-Identifier: Apache-2.0
/**
 * Point d'appel commun des builds du site (`build-site-external.ts`, `server.ts` et, par lui,
 * `desktop.ts`) : le viewport WebGPU de l'éditeur Koharu importe le WASM de
 * `crates/koharu-canvas` (`packages/koharu/src/wasm/`, suivi par Git), que Next doit trouver
 * pour l'émettre sous `static/media/`. `ensureKoharuWasm()` lance
 * `packages/koharu/scripts/build-wasm.ts`, qui ne reconstruit que si son tampon est périmé
 * (Cargo par `cargo-runner.ts`, donc sur le VPS depuis WSL) ; sans Rust, le module suivi sert.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
export const KOHARU_WASM_DIR = join(ROOT, "packages/koharu/src/wasm");
export const KOHARU_WASM = join(KOHARU_WASM_DIR, "koharu_canvas_bg.wasm");
const BUILD_WASM = join(ROOT, "packages/koharu/scripts/build-wasm.ts");

export function ensureKoharuWasm(): void {
  if (!Bun.which("cargo") && existsSync(KOHARU_WASM)) {
    console.warn("⚠ cargo absent : WASM koharu-canvas existant utilisé sans contrôle de fraîcheur");
    return;
  }
  const build = Bun.spawnSync([process.execPath, BUILD_WASM], {
    cwd: ROOT,
    stdio: ["inherit", "inherit", "inherit"],
  });
  if (build.exitCode !== 0 || !existsSync(KOHARU_WASM)) {
    throw new Error(
      "build du WASM koharu-canvas en échec (bun packages/koharu/scripts/build-wasm.ts) : " +
        "Rust (rustup, cargo) est requis",
    );
  }
}

/** Fichiers `.wasm` de koharu-canvas émis par Next sous `<distDir>/static/media/`. */
export function emittedKoharuWasm(distDir: string): string[] {
  const media = join(distDir, "static", "media");
  if (!existsSync(media)) return [];
  return [...new Bun.Glob("koharu_canvas_bg.*.wasm").scanSync({ cwd: media })].map((name) =>
    join(media, name),
  );
}
