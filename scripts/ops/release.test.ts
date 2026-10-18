// SPDX-License-Identifier: Apache-2.0
/**
 * Mise en production : le CDN reçoit les chunks de la nouvelle release AVANT la bascule, et le
 * site est construit avec le préfixe du CDN tiré de l'environnement du service.
 */
import { describe, expect, test } from "bun:test";
import { cdnSource, envValue, siteBuildEnv, syncCommands } from "./release-host";
import { asServiceUser, releaseConfig, releasePlan } from "./release";

describe("release plan", () => {
  test("release endpoints and remote paths come from environment", () => {
    expect(
      releaseConfig({
        SHENRON_RELEASE_HOST: "factory",
        SHENRON_RELEASE_SERVICE_HOME: "/srv/runner",
        SHENRON_RELEASE_SERVICE_PATH: "/srv/runner/bin",
        SHENRON_RELEASE_REMOTE: "/tmp/release.ts",
        SHENRON_RELEASE_LOG: "/tmp/release.log",
        SHENRON_SITE_URL: "https://site.example",
        SHENRON_CDN_URL: "https://cdn.example",
        SHENRON_BOT_URL: "https://bot.example",
        SHENRON_RELEASE_STACK: "catalog",
      }),
    ).toEqual({
      host: "factory",
      serviceHome: "/srv/runner",
      servicePath: "/srv/runner/bin",
      remoteScript: "/tmp/release.ts",
      logPath: "/tmp/release.log",
      siteUrl: "https://site.example",
      cdnUrl: "https://cdn.example",
      botUrl: "https://bot.example",
      stack: "catalog",
    });
  });
  test("remote commands use the service account instead of the SSH login user's home", () => {
    const command = asServiceUser("printf '%s' \"$HOME\"");
    expect(command.startsWith("sudo -n -u ubuntu ")).toBe(true);
    expect(command).toContain("HOME=/home/ubuntu");
    expect(command).toContain("PATH=/home/ubuntu/.bun/bin:/home/ubuntu/.cargo/bin");
    expect(command).toContain("bash -c 'printf '\\''%s'\\'' \"$HOME\"'");
  });

  test("the new release reaches the CDN before the deploy, the active one again after", () => {
    const plan = releasePlan(new Set());
    expect(plan).toEqual(["build", "cdn:release", "deploy", "cdn:current", "probes"]);
    expect(plan.indexOf("cdn:release")).toBeLessThan(plan.indexOf("deploy"));
  });

  test("options", () => {
    expect(releasePlan(new Set(["--cdn-only"]))).toEqual(["cdn:current", "probes"]);
    expect(releasePlan(new Set(["--no-deploy"]))).toEqual(["build"]);
  });
});

describe("site build environment", () => {
  const env = [
    "NODE_ENV=production",
    'DATABASE_URL="postgres://site:secret@127.0.0.1:5432/shenron"',
    "NEXT_PUBLIC_CDN_URL=https://cdn.dragonballfr.com",
  ].join("\n");

  test("database and CDN go to the build", () => {
    expect(siteBuildEnv(env)).toEqual({
      SITE_BUILD_DATABASE_URL: "postgres://site:secret@127.0.0.1:5432/shenron",
      NEXT_PUBLIC_CDN_URL: "https://cdn.dragonballfr.com",
    });
  });

  test("without a CDN the build keeps /_next/; without a database it refuses", () => {
    expect(siteBuildEnv("DATABASE_URL=postgres://x@h/db")).toEqual({
      SITE_BUILD_DATABASE_URL: "postgres://x@h/db",
    });
    expect(() => siteBuildEnv("NEXT_PUBLIC_CDN_URL=https://cdn.example")).toThrow();
    expect(envValue("A=1\nB='two'\n", "B")).toBe("two");
    expect(envValue("A=1", "B")).toBeUndefined();
  });

  test("cdn publishes an assembled release or the active one, nothing else", () => {
    const sha = "a".repeat(40);
    expect(cdnSource(undefined)).toBe("/srv/shenron/current");
    expect(cdnSource(`/srv/shenron/releases/${sha}`)).toBe(`/srv/shenron/releases/${sha}`);
    expect(() => cdnSource("/tmp/x")).toThrow();
    expect(() => cdnSource(`/srv/shenron/releases/${sha}/../..`)).toThrow();
  });
});

describe("build tree", () => {
  test("a dedicated detached worktree is forced onto the ref, the editable checkout untouched", () => {
    const first = syncCommands("/h/shenron", "/h/shenron-release", "origin/main", false);
    expect(first[0]).toEqual(["git", "-C", "/h/shenron", "fetch", "-q", "origin"]);
    expect(first[1]).toEqual([
      "git",
      "-C",
      "/h/shenron",
      "worktree",
      "add",
      "-q",
      "--detach",
      "/h/shenron-release",
      "origin/main",
    ]);
    const again = syncCommands("/h/shenron", "/h/shenron-release", "origin/main", true);
    expect(again.map((cmd) => cmd.slice(3, 5).join(" "))).toEqual([
      "fetch -q",
      "checkout -q",
      "submodule update",
      "clean -ffdq",
    ]);
    expect(again.flat()).not.toContain("merge");
    expect(again.slice(1).every((cmd) => cmd[2] === "/h/shenron-release")).toBe(true);
  });
});
