// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { containerArgs, gitToken } from "./container";

test("builds run bounded, non-root, on shared caches, secrets by name only", () => {
  const args = containerArgs({
    repo: "/home/shenron-build/runner/_work/shenron/shenron", // paths:ok
    command: ["bun", "ci"],
    uid: 1002,
    gid: 1002,
    env: ["SITE_BUILD_DATABASE_URL"],
    lock: false,
  });
  expect(args.slice(0, 2)).toEqual(["docker", "run"]);
  expect(args).toContain("1002:1002");
  expect(args).toContain("--memory-swap");
  expect(args).toContain("shenron-build-xdg:/cache/xdg");
  expect(args.join(" ")).not.toMatch(/cargo|sccache|CARGO_TARGET_DIR/);
  expect(args.join(" ")).not.toContain("SITE_BUILD_DATABASE_URL=");
  expect(args.slice(-3)).toEqual(["shenron-build:latest", "bun", "ci"]);
});

test("unsafe or unbounded requests are refused", () => {
  const base = { repo: "/r", command: ["true"], uid: 1, gid: 1, lock: false };
  expect(() => containerArgs({ ...base, cpus: "8" })).toThrow();
  expect(() => containerArgs({ ...base, memory: "lots" })).toThrow();
  expect(() => containerArgs({ ...base, env: ["A=b"] })).toThrow();
});

test("jeton Git : environnement de l'appelant d'abord, gh en dernier, jamais requis", () => {
  expect(gitToken({ SHENRON_GIT_TOKEN: "a", GH_TOKEN: "b" }, () => "c")).toBe("a");
  expect(gitToken({ GITHUB_TOKEN: "d" }, () => "c")).toBe("d");
  expect(gitToken({}, () => "c")).toBe("c");
  expect(gitToken({}, () => undefined)).toBeUndefined();
});
