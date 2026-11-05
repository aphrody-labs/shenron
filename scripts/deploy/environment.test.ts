// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { activationEnv, driftProblems, loadDefinition, shellExports } from "./environment.ts";

test("every consumer of this repository matches deploy/environment.json", () => {
  expect(driftProblems()).toEqual([]);
});

test("a pin changed in the definition alone is reported", () => {
  const definition = loadDefinition();
  const drifted = { ...definition, toolchain: { ...definition.toolchain, rust: "0.0.0" } };
  const problems = driftProblems(undefined, drifted);
  expect(problems.some((problem) => problem.startsWith("rust-toolchain.toml channel"))).toBe(true);
  expect(problems.some((problem) => problem.startsWith("Dockerfile.build RUST_VERSION"))).toBe(true);
});

test("shell exports leave $HOME to the shell and keep explicit overrides", () => {
  const text = shellExports(loadDefinition());
  expect(text).toContain('export SCCACHE_DIR="${SCCACHE_DIR:-$HOME/.cache/shenron/sccache}"');
  expect(text).toContain('export BUN_INSTALL_CACHE_DIR="${BUN_INSTALL_CACHE_DIR:-$HOME/.bun/install/cache}"');
});

test("the activation environment covers every activated service", () => {
  const text = activationEnv(loadDefinition());
  expect(text).toContain("ACTIVATION_ORDER='site bot'");
  expect(text).toContain("HEALTH_SITE='http://127.0.0.1:5011/api/local/health'");
  expect(text).toContain("CONTAINER_BOT='shenron-bot'");
  expect(text).not.toMatch(/postgres|redis|chat|compute|embed/i);
});
