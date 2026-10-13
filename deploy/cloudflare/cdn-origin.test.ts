// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  assertFreshOriginProfile,
  assertOriginInventoryPin,
  originObjectKeyAllowed,
  originAttestation,
  originRootPrivate,
  storedOriginObject,
} from "./cdn-origin";

test("origin attestation exposes pins without local paths or credentials", () => {
  const value = originAttestation(
    { manifestPrefix: "_migration/manifests/site-fixture/", inventorySha256: "a".repeat(64) },
    "b".repeat(64),
  );
  expect(value.backend).toBe("native-manifest-origin");
  expect(value.serviceVersion).toBe("shenron-cdn-origin/v1");
  expect(value.codeSha256).toBe("b".repeat(64));
  expect(Object.keys(value).sort()).toEqual([
    "backend",
    "codeSha256",
    "inventorySha256",
    "manifestPrefix",
    "serviceVersion",
  ]);
});

test("origin private configuration requires the root owner and private mode", () => {
  expect(originRootPrivate({ mode: 0o600, uid: 0 })).toBe(true);
  expect(originRootPrivate({ mode: 0o644, uid: 0 })).toBe(false);
  expect(originRootPrivate({ mode: 0o600, uid: 1000 })).toBe(false);
});

test("origin expired scoped credentials fail closed", () => {
  const manifest = {
    accountId: "a".repeat(32),
    zoneId: "b".repeat(32),
    bucket: "fixture",
    worker: "fixture",
    tunnelId: "fixture",
  };
  const profile = {
    endpoint: `https://${manifest.accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    accessKeyId: "fixture",
    secretAccessKey: "fixture",
    sessionToken: "fixture",
    bucket: "fixture",
    prefixes: ["_objects/", "_migration/"],
    permission: "object-read-write",
    expiresAt: "2026-10-13T10:00:00.000Z",
  };
  expect(() =>
    assertFreshOriginProfile(profile, manifest, Date.parse("2026-10-13T09:00:00.000Z")),
  ).not.toThrow();
  expect(() =>
    assertFreshOriginProfile(profile, manifest, Date.parse("2026-10-13T10:00:01.000Z")),
  ).toThrow("Origin scoped credential expired");
});

test("origin admits only content addressed object keys", () => {
  expect(originObjectKeyAllowed(`_objects/${"a".repeat(64)}`)).toBe(true);
  for (const key of [
    "_objects/../.env",
    "_migration/00.json",
    "private/database.sql",
    "_objects/not-a-digest",
  ])
    expect(originObjectKeyAllowed(key)).toBe(false);
});

test("origin inventory pin rejects altered bytes before serving", () => {
  const bytes = new TextEncoder().encode('{"entries":{}}');
  const sha = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  expect(() => assertOriginInventoryPin(bytes, sha)).not.toThrow();
  expect(() => assertOriginInventoryPin(new TextEncoder().encode("corrupt"), sha)).toThrow(
    "Origin inventory differs",
  );
});

test("origin keeps the full size for ranges and fails closed on missing size", () => {
  const sha = "b".repeat(64);
  const head = storedOriginObject(
    new Response(null, { headers: { "content-length": "2048", "x-amz-meta-sha256": sha } }),
  );
  expect(head?.size).toBe(2048);
  expect(head?.customMetadata?.sha256).toBe(sha);
  const range = storedOriginObject(
    new Response("0123", {
      status: 206,
      headers: {
        "content-length": "4",
        "content-range": "bytes 0-3/2048",
        "x-amz-meta-sha256": sha,
      },
    }),
  );
  expect(range?.size).toBe(2048);
  expect(storedOriginObject(new Response(null))).toBeNull();
  expect(storedOriginObject(new Response(null, { status: 403 }))).toBeNull();
});
