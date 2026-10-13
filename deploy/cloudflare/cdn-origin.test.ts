// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  assertFreshOriginProfile,
  assertOriginInventoryPin,
  originObjectKeyAllowed,
  originAttestation,
  originRootPrivate,
  originResponse,
  storedOriginObject,
} from "./cdn-origin";

test("media and catalogue indexes remain fresh while image cache policy is preserved", async () => {
  for (const path of ["/media/episodes/875/source/gifs/index.json", "/catalog/assets/index.json"]) {
    const response = new Response("{}", { headers: { "Cache-Control": "public, max-age=86400" } });
    expect(
      (
        await originResponse(new Request("https://cdn.dragonballfr.com" + path), response)
      ).headers.get("Cache-Control"),
    ).toBe("no-store");
  }
  const image = new Response(null, { headers: { "Cache-Control": "public, max-age=86400" } });
  expect(
    (
      await originResponse(new Request("https://cdn.dragonballfr.com/media/frame.png"), image)
    ).headers.get("Cache-Control"),
  ).toBe("public, max-age=86400");
});

test("small media ranges retain a fixed length on Bun.serve", async () => {
  const bytes = new Uint8Array(1024).fill(7);
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      return originResponse(
        request,
        new Response(upstream, {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": "1024",
            "Content-Range": "bytes 0-1023/7922847",
          },
        }),
      );
    },
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/assets/wiki/example.mp4`, {
      headers: { Range: "bytes=0-1023" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Length")).toBe("1024");
    expect(response.headers.get("Content-Range")).toBe("bytes 0-1023/7922847");
    expect(response.headers.get("Transfer-Encoding")).toBeNull();
    expect((await response.bytes()).byteLength).toBe(1024);
  } finally {
    server.stop(true);
  }
});

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
