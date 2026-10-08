// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { containerArgs, gitToken, imageProblems } from "./container";

test("builds run bounded, non-root, on shared caches, secrets by name only", () => {
  const args = containerArgs({
    repo: "/home/shenron-build/runner/_work/shenron/shenron",
    command: ["bun", "ci"],
    uid: 1002,
    gid: 1002,
    targetVolume: "shenron-ci",
    env: ["SITE_BUILD_DATABASE_URL"],
    lock: false,
  });
  expect(args.slice(0, 2)).toEqual(["docker", "run"]);
  expect(args).toContain("1002:1002");
  expect(args).toContain("--memory-swap");
  expect(args).toContain("aphrody-build-sccache:/cache/sccache");
  expect(args).toContain("aphrody-build-target-shenron-ci:/cache/target");
  expect(args.join(" ")).not.toContain("SITE_BUILD_DATABASE_URL=");
  expect(args.slice(-3)).toEqual(["aphrody-build:latest", "bun", "ci"]);
});

test("unsafe or unbounded requests are refused", () => {
  const base = { repo: "/r", command: ["true"], uid: 1, gid: 1, lock: false };
  expect(() => containerArgs({ ...base, cpus: "8" })).toThrow();
  expect(() => containerArgs({ ...base, memory: "lots" })).toThrow();
  expect(() => containerArgs({ ...base, env: ["A=b"] })).toThrow();
  expect(() => containerArgs({ ...base, targetVolume: "../x" })).toThrow();
});

test("the image must match the checkout's Rust and wasm-bindgen pins", () => {
  const toolchain = 'channel = "1.98.1"\n';
  const lock = '[[package]]\nname = "wasm-bindgen"\nversion = "0.2.129"\n';
  const labels = { "dev.aphrody.rust": "1.98.1", "dev.aphrody.wasm-bindgen": "0.2.129" };
  expect(imageProblems(labels, toolchain, lock)).toEqual([]);
  expect(imageProblems({ ...labels, "dev.aphrody.rust": "1.97.0" }, toolchain, lock)).toHaveLength(
    1,
  );
  expect(imageProblems({}, toolchain, lock)).toHaveLength(2);
});

test("jeton Git : environnement de l'appelant d'abord, gh en dernier, jamais requis", () => {
  expect(gitToken({ APHRODY_GIT_TOKEN: "a", GH_TOKEN: "b" }, () => "c")).toBe("a");
  expect(gitToken({ GITHUB_TOKEN: "d" }, () => "c")).toBe("d");
  expect(gitToken({}, () => "c")).toBe("c");
  expect(gitToken({}, () => undefined)).toBeUndefined();
});
