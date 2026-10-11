// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { grant, validateProfile } from "./s3-profile";
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
