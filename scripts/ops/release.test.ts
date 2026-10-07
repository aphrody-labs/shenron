// SPDX-License-Identifier: Apache-2.0
/**
 * Mise en production : le CDN reçoit les chunks de la nouvelle release AVANT la bascule, et le
 * site est construit avec le préfixe du CDN tiré de l'environnement du service.
 */
import { describe, expect, test } from "bun:test";
import { cdnSource, envValue, siteBuildEnv } from "./release-host";
import { asServiceUser, releasePlan } from "./release";

describe("release plan", () => {
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
