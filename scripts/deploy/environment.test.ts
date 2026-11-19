// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  activationEnv,
  bunBuildOf,
  driftProblems,
  hostProblems,
  loadDefinition,
  resolveTriadNode,
  shellExports,
} from "./environment.ts";

test("every consumer of this repository matches deploy/environment.json", () => {
  expect(driftProblems()).toEqual([]);
});

test("canonical triad nodes and legacy aliases resolve accurately", () => {
  const definition = loadDefinition();
  expect(resolveTriadNode("vps", definition)).toMatchObject({
    alias: "vps",
    meshIp: "10.200.77.1",
    publicIp: "51.77.147.152",
  });
  expect(resolveTriadNode("cdn", definition)).toMatchObject({
    alias: "cdn",
    legacyAlias: "bunos",
    meshIp: "10.200.77.3",
    publicIp: "51.255.162.6",
  });
  expect(resolveTriadNode("bunos", definition)).toEqual(resolveTriadNode("cdn", definition));
  expect(resolveTriadNode("prod", definition)).toMatchObject({
    alias: "prod",
    legacyAlias: "dbfr",
    meshIp: "10.200.77.5",
    publicIp: "72.60.186.43",
    os: "Arch Linux 7.2.11",
    domain: "dragonballfr.com",
  });
  expect(resolveTriadNode("dbfr", definition)).toEqual(resolveTriadNode("prod", definition));
  expect(resolveTriadNode("unknown", definition)).toBeUndefined();
});

test("a pin changed in the definition alone is reported", () => {
  const definition = loadDefinition();
  const drifted = { ...definition, toolchain: { ...definition.toolchain, rust: "0.0.0" } };
  const problems = driftProblems(undefined, drifted);
  expect(problems.some((problem) => problem.startsWith("rust-toolchain.toml channel"))).toBe(true);
  expect(problems.some((problem) => problem.startsWith("Dockerfile.build RUST_VERSION"))).toBe(
    true,
  );
});

test("shell exports leave $HOME to the shell and keep explicit overrides", () => {
  const text = shellExports(loadDefinition());
  expect(text).toContain('export SCCACHE_DIR="${SCCACHE_DIR:-$HOME/.cache/shenron/sccache}"');
  expect(text).toContain(
    'export BUN_INSTALL_CACHE_DIR="${BUN_INSTALL_CACHE_DIR:-$HOME/.bun/install/cache}"',
  );
});

test("the activation environment covers every activated service", () => {
  const text = activationEnv(loadDefinition());
  expect(text).toContain("ACTIVATION_ORDER='site bot'");
  expect(text).toContain("HEALTH_SITE='http://127.0.0.1:5011/api/local/health'");
  expect(text).toContain("CONTAINER_BOT='shenron-bot'");
  expect(text).not.toMatch(/postgres|redis|chat|compute|embed/i);
});

const STABLE = "1.4.5+a7733435c";
const CANARY = "1.4.5-canary.1+6db952080";

test("the definition pins the Bun channel and the exact revision", () => {
  const { toolchain } = loadDefinition();
  expect(toolchain.bunChannel).toBe("stable");
  expect(toolchain.bunRevision).toMatch(/^[0-9a-f]{7,40}$/);
  expect(bunBuildOf(STABLE)).toEqual({ channel: "stable", commit: "a7733435c" });
  expect(bunBuildOf(CANARY)).toEqual({ channel: "canary", commit: "6db952080" });
  expect(bunBuildOf("")).toEqual({ channel: "", commit: "" });
});

test("a host on the pinned channel and revision reports nothing", () => {
  const definition = loadDefinition();
  const rustc = `rustc ${definition.toolchain.rust} (abcdef012 2026-01-01)`;
  const host = { rustc, bun: definition.toolchain.bun, revision: STABLE };
  expect(hostProblems(definition, host)).toEqual([]);
  expect(hostProblems(definition, { ...host, revision: "1.4.5+a7733435cf40429e3b" })).toEqual([]);
});

test("a canary host against the stable pin reports the channel and the revision", () => {
  const definition = loadDefinition();
  const rustc = `rustc ${definition.toolchain.rust} (abcdef012 2026-01-01)`;
  const host = { rustc, bun: definition.toolchain.bun, revision: CANARY };
  expect(hostProblems(definition, host)).toEqual([
    'bun channel: found "canary", wanted stable',
    'bun revision: found "6db952080", wanted a7733435c',
  ]);
});

test("a stable host on another revision reports the revision alone", () => {
  const definition = loadDefinition();
  const rustc = `rustc ${definition.toolchain.rust} (abcdef012 2026-01-01)`;
  const host = { rustc, bun: definition.toolchain.bun, revision: "1.4.5+0123456ab" };
  expect(hostProblems(definition, host)).toEqual([
    'bun revision: found "0123456ab", wanted a7733435c',
  ]);
});

test("a missing Bun is reported with an empty channel and revision", () => {
  const definition = loadDefinition();
  const problems = hostProblems(definition, { rustc: "", bun: "", revision: "" });
  expect(problems).toContain('bun channel: found "", wanted stable');
  expect(problems).toContain('bun revision: found "", wanted a7733435c');
});

test("a definition pinning canary or a malformed revision fails the drift gate", () => {
  const definition = loadDefinition();
  const canary = {
    ...definition,
    toolchain: { ...definition.toolchain, bunChannel: "canary" as const },
  };
  expect(driftProblems(undefined, canary)).toContain(
    'Dockerfile.build bun channel: found "stable", the definition says "canary"',
  );
  const malformed = { ...definition, toolchain: { ...definition.toolchain, bunRevision: "HEAD" } };
  expect(driftProblems(undefined, malformed)).toContain(
    'toolchain.bunRevision: found "HEAD", the definition says a 7 to 40 digit lowercase hex commit',
  );
});
