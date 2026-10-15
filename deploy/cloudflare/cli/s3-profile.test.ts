// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, rm, chmod, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grant, validateProfile, projectConsumerProfile } from "./s3-profile";
import { validateProfileFile } from "./transfer";

test.skipIf(process.platform === "win32" || !process.getuid?.())(
  "issuer projects only temporary grants atomically into a trusted private bot boundary",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "shenron-s3-consumer-")),
      uid = process.getuid!(),
      gid = process.getgid!();
    const directory = join(root, "source-pipeline/credentials"),
      target = { dataRoot: root, directory, uid, gid };
    const profile = {
      endpoint: "https://" + "a".repeat(32) + ".r2.cloudflarestorage.com",
      region: "auto",
      bucket: "shenron-cdn",
      accessKeyId: "fixture-access",
      secretAccessKey: "fixture-secret",
      sessionToken: "fixture-session",
      prefixes: ["_objects/", "_migration/"],
      permission: "object-read-write",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      parentApiToken: "must-never-project",
    };
    try {
      expect(await projectConsumerProfile(profile, target)).toMatchObject({
        uid,
        gid,
        mode: "0400",
        expiresAt: profile.expiresAt,
      });
      const path = join(directory, "s3.json"),
        first = await stat(path),
        projected = await Bun.file(path).json();
      expect([first.uid, first.gid, first.mode & 0o777]).toEqual([uid, gid, 0o400]);
      expect(projected.parentApiToken).toBeUndefined();
      expect(projected.sessionToken).toBe(profile.sessionToken);
      await validateProfileFile(path, directory);
      await expect(validateProfileFile(path)).rejects.toThrow("not trusted");
      await projectConsumerProfile({ ...profile, sessionToken: "rotated-session" }, target);
      expect((await Bun.file(path).json()).sessionToken).toBe("rotated-session");
      expect((await stat(path)).ino).not.toBe(first.ino);
      await chmod(path, 0o440);
      await expect(validateProfileFile(path, directory)).rejects.toThrow("permissions");
      await chmod(path, 0o400);
      await expect(projectConsumerProfile(profile, { ...target, directory: root })).rejects.toThrow(
        "inside",
      );
      await expect(
        projectConsumerProfile(profile, { ...target, directory: join(root, "../escape") }),
      ).rejects.toThrow("inside");
      await symlink(directory, join(root, "alias"));
      await expect(
        projectConsumerProfile(profile, { ...target, directory: join(root, "alias") }),
      ).rejects.toThrow("private");
      const alias = join(directory, "alias.json");
      await symlink(path, alias);
      await expect(validateProfileFile(alias, directory)).rejects.toThrow("regular");
      await chmod(directory, 0o755);
      await expect(validateProfileFile(path, directory)).rejects.toThrow("boundary");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
test("temporary credential is constrained to Shenron object prefixes and one hour", () => {
  const g = grant("shenron-cdn", "a".repeat(32));
  expect(g.permission).toBe("object-read-write");
  expect(g.ttlSeconds).toBe(3600);
  expect(g.prefixes).toEqual(["_objects/", "_migration/"]);
  expect(() => grant("shenron-cdn", "foreign")).toThrow();
});
test("foreign bucket or broad scope cannot replace Shenron profile", () => {
  const m = {
    accountId: "a".repeat(32),
    zoneId: "b".repeat(32),
    bucket: "shenron-cdn",
    worker: "test",
    tunnelId: "f2ddf195-5d19-4321-8b12-259c7c57659b",
  };
  const p = {
    endpoint: `https://${m.accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    accessKeyId: "fixture",
    secretAccessKey: "fixture",
    sessionToken: "fixture",
    bucket: m.bucket,
    prefixes: ["_objects/", "_migration/"],
    permission: "object-read-write",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  expect(() => validateProfile(p, m)).not.toThrow();
  expect(() => validateProfile({ ...p, bucket: "aphrody-assets" }, m)).toThrow();
  expect(() => validateProfile({ ...p, prefixes: [""] }, m)).toThrow();
});
