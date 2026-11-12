// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  inventory,
  within,
  verifiedHeaders,
  credentialFingerprint,
  ByteBudget,
  metadataHeaders,
  attestStagedObject,
  verifyStoredObject,
} from "./transfer";

test("remote CAS verifier compares MIME essences while preserving byte and checksum checks", async () => {
  const bytes = new TextEncoder().encode("parameterized asset");
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  let badChecksum = false;
  const signed = {
    async fetch(_url: string, init: RequestInit) {
      if (init.method === "GET") return new Response(bytes);
      return new Response(null, {
        headers: {
          "content-type": "TEXT/JAVASCRIPT; charset=utf-8",
          "x-amz-meta-sha256": sha256,
          "x-amz-checksum-sha256": badChecksum
            ? "wrong"
            : Buffer.from(sha256, "hex").toString("base64"),
        },
      });
    },
  };
  const entry = { sha256, size: bytes.length, contentType: " text/JavaScript;charset=utf-8 " };
  await verifyStoredObject(signed, "https://example.test/object", entry);
  badChecksum = true;
  await expect(verifyStoredObject(signed, "https://example.test/object", entry)).rejects.toThrow(
    "Remote CAS metadata differs",
  );
});
function stagedFixture(
  options: {
    badBytes?: boolean;
    errorXml?: boolean;
    qualified?: boolean;
    oversized?: boolean;
  } = {},
) {
  const body = new TextEncoder().encode("public bytes"),
    sha256 = new Bun.CryptoHasher("sha256").update(body).digest("hex"),
    entry = { sha256, size: body.length, contentType: "image/png" },
    calls: RequestInit[] = [];
  let copied = options.qualified ?? false,
    cancelled = false;
  const signed = {
    async fetch(_url: string, init: RequestInit) {
      calls.push(init);
      if (init.method === "HEAD")
        return new Response(null, {
          headers: {
            "Content-Length": String(body.length),
            ETag: '"source-etag"',
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
            ...(copied ? { "x-amz-meta-sha256": sha256 } : {}),
          },
        });
      if (init.method === "PUT") {
        copied = true;
        return new Response(
          options.errorXml
            ? "<Error><Code>Denied</Code></Error>"
            : "<CopyObjectResult><ETag>source-etag</ETag></CopyObjectResult>",
        );
      }
      if (options.oversized)
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(body.length + 1));
            },
            cancel() {
              cancelled = true;
            },
          }),
        );
      return new Response(options.badBytes ? new Uint8Array(body.length) : body);
    },
  };
  return {
    signed,
    entry,
    calls,
    url: "https://" + "a".repeat(32) + ".r2.cloudflarestorage.com/shenron-cdn/_objects/" + sha256,
    cancelled: () => cancelled,
  };
}
test("staged CAS metadata uses guarded MERGE CopyObject and zero object body uploads", async () => {
  const f = stagedFixture(),
    r = await attestStagedObject(f.signed, f.url, f.entry);
  expect(r).toMatchObject({ metadataUpdated: true, actualGets: 2, objectBytesUploaded: 0 });
  expect(f.calls.map((c) => c.method)).toEqual(["HEAD", "GET", "PUT", "HEAD", "GET"]);
  const copy = f.calls[2]!;
  expect(copy.body).toBeUndefined();
  expect(copy.headers).toMatchObject({
    "x-amz-metadata-directive": "MERGE",
    "x-amz-meta-sha256": f.entry.sha256,
    "x-amz-copy-source": "/shenron-cdn/_objects/" + f.entry.sha256,
    "x-amz-copy-source-if-match": '"source-etag"',
    "cf-copy-destination-if-match": '"source-etag"',
  });
});
test("qualified staged CAS still reads actual bytes without copying metadata", async () => {
  const f = stagedFixture({ qualified: true }),
    r = await attestStagedObject(f.signed, f.url, f.entry);
  expect(r.metadataUpdated).toBe(false);
  expect(f.calls.map((c) => c.method)).toEqual(["HEAD", "GET", "HEAD", "GET"]);
});
test("staged CAS rejects mismatched or overflowing bytes before any mutation", async () => {
  for (const options of [{ badBytes: true }, { oversized: true }]) {
    const f = stagedFixture(options);
    await expect(attestStagedObject(f.signed, f.url, f.entry)).rejects.toThrow();
    expect(f.calls.some((c) => c.method === "PUT")).toBe(false);
    if (options.oversized) expect(f.cancelled()).toBe(true);
  }
});
test("CopyObject HTTP200 containing an error cannot qualify staged CAS", async () => {
  const f = stagedFixture({ errorXml: true });
  await expect(attestStagedObject(f.signed, f.url, f.entry)).rejects.toThrow("CopyObject failed");
  expect(f.calls.map((c) => c.method)).toEqual(["HEAD", "GET", "PUT"]);
});
test("staged CAS scope rejects foreign endpoints and oversized identities", async () => {
  const f = stagedFixture();
  await expect(
    attestStagedObject(
      f.signed,
      f.url.replace(".r2.cloudflarestorage.com", ".google.com"),
      f.entry,
    ),
  ).rejects.toThrow();
  await expect(
    attestStagedObject(f.signed, f.url, { ...f.entry, size: 33 * 1024 * 1024 + 1 }),
  ).rejects.toThrow();
  expect(f.calls).toEqual([]);
});
test("explicit archive budget hashes a 64 MiB source as bounded streams", async () => {
  const size = 67099654,
    chunk = new Uint8Array(65536),
    hash = new Bun.CryptoHasher("sha256");
  for (let remaining = size; remaining > 0; remaining -= Math.min(remaining, chunk.length))
    hash.update(chunk.subarray(0, Math.min(remaining, chunk.length)));
  const sha256 = hash.digest("hex"),
    calls: RequestInit[] = [],
    entry = { size, sha256, contentType: "application/gzip" };
  const signed = {
    async fetch(_url: string, init: RequestInit) {
      calls.push(init);
      if (init.method === "HEAD")
        return new Response(null, {
          headers: {
            ETag: '"archive-etag"',
            "Content-Length": String(size),
            "Content-Type": entry.contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "x-amz-meta-sha256": sha256,
          },
        });
      let remaining = size;
      return new Response(
        new ReadableStream({
          pull(c) {
            if (!remaining) {
              c.close();
              return;
            }
            const count = Math.min(remaining, chunk.length);
            remaining -= count;
            c.enqueue(chunk.subarray(0, count));
          },
        }),
      );
    },
  };
  const url =
    "https://" + "a".repeat(32) + ".r2.cloudflarestorage.com/shenron-cdn/_objects/" + sha256;
  const result = await attestStagedObject(signed, url, entry, {
    maxBytes: 64 * 1024 * 1024,
    timeoutMs: 300000,
  });
  expect(result.size).toBe(size);
  expect(result.budget.maxBytes).toBe(64 * 1024 * 1024);
  expect(result.objectBytesUploaded).toBe(0);
  expect(calls.map((c) => c.method)).toEqual(["HEAD", "GET", "HEAD", "GET"]);
});
test("archive MIME and caller budgets reject unsupported grants before requests", async () => {
  const f = stagedFixture();
  await expect(
    attestStagedObject(
      f.signed,
      f.url,
      { ...f.entry, contentType: "text/html" },
      { maxBytes: 128 * 1024 * 1024, timeoutMs: 300000 },
    ),
  ).rejects.toThrow();
  await expect(
    attestStagedObject(f.signed, f.url, f.entry, {
      maxBytes: 128 * 1024 * 1024 + 1,
      timeoutMs: 300000,
    }),
  ).rejects.toThrow();
  await expect(
    attestStagedObject(f.signed, f.url, f.entry, {
      maxBytes: 128 * 1024 * 1024,
      timeoutMs: 300001,
    }),
  ).rejects.toThrow();
  expect(f.calls).toEqual([]);
});
test("caller mutation cannot alter pinned CAS identity or budgets in flight", async () => {
  const f = stagedFixture(),
    originalSha = f.entry.sha256,
    budget = { maxBytes: 33 * 1024 * 1024, timeoutMs: 120000 };
  let changed = false;
  const signed = {
    async fetch(url: string, init: RequestInit) {
      if (!changed) {
        changed = true;
        f.entry.sha256 = "b".repeat(64);
        budget.maxBytes = 0;
        budget.timeoutMs = 0;
      }
      return f.signed.fetch(url, init);
    },
  };
  const result = await attestStagedObject(signed, f.url, f.entry, budget);
  expect(result.sha256).toBe(originalSha);
  expect(result.budget).toEqual({ maxBytes: 33 * 1024 * 1024, timeoutMs: 120000 });
});
test("staged GET failure cancels its response body and zero-byte identities are refused", async () => {
  const f = stagedFixture();
  let cancelled = false;
  const signed = {
    async fetch(url: string, init: RequestInit) {
      if (init.method === "GET")
        return new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { status: 403 },
        );
      return f.signed.fetch(url, init);
    },
  };
  await expect(attestStagedObject(signed, f.url, f.entry)).rejects.toThrow("Staged GET HTTP 403");
  expect(cancelled).toBe(true);
  const empty = stagedFixture();
  await expect(
    attestStagedObject(empty.signed, empty.url, { ...empty.entry, size: 0 }),
  ).rejects.toThrow();
  expect(empty.calls).toEqual([]);
});
const entry = {
  path: "/assets/a.png",
  sha256: "a".repeat(64),
  size: 12,
  sourcePath: process.platform === "win32" ? "C:/public/a.png" : "/public/a.png",
  contentType: "image/png",
};
test("signed uploads attest byte digest as metadata and standard checksum", () => {
  const hash = new Bun.CryptoHasher("sha256").update("public bytes").digest("hex");
  const headers = metadataHeaders(hash, "text/plain", "no-store");
  expect(headers["x-amz-meta-sha256"]).toBe(hash);
  expect(Buffer.from(headers["x-amz-checksum-sha256"], "base64").toString("hex")).toBe(hash);
  expect(headers["Cache-Control"]).toBe("no-store");
  expect(() => metadataHeaders(hash, "text/plain\r\nx-secret:bad", "no-store")).toThrow();
});
test("changed inventory or path traversal cannot reach provider", () => {
  expect(inventory([entry])).toHaveLength(1);
  expect(() => inventory([{ ...entry, path: "/assets/../private" }])).toThrow();
  expect(() => inventory([{ ...entry, size: 34 * 1024 * 1024 }])).toThrow();
  expect(() => inventory([entry, entry])).toThrow();
});
test("verifier must attest exact digest and size", () => {
  expect(
    verifiedHeaders(
      new Response(null, {
        status: 200,
        headers: { "X-Content-SHA256": entry.sha256, "X-Content-Size": "12" },
      }),
      entry,
    ),
  ).toBe(true);
  expect(
    verifiedHeaders(
      new Response(null, {
        status: 200,
        headers: { "X-Content-SHA256": "b".repeat(64), "Content-Length": "12" },
      }),
      entry,
    ),
  ).toBe(false);
});
test("session renewal refreshes client even when access key ID remains same", () => {
  const p = {
    accessKeyId: "fixture",
    secretAccessKey: "fixture",
    sessionToken: "first",
    expiresAt: "2026-10-11T12:00:00Z",
  };
  expect(credentialFingerprint(p)).not.toBe(
    credentialFingerprint({ ...p, sessionToken: "second" }),
  );
});
test("byte budget prevents impossible reservation and balances failed work", async () => {
  const b = new ByteBudget(12);
  await b.reserve(12);
  expect(b.used).toBe(12);
  b.release(12);
  expect(b.used).toBe(0);
  await expect(b.reserve(13)).rejects.toThrow();
  expect(within(resolveRoot("a"), resolveRoot("a"))).toBe(true);
  expect(within(resolveRoot("ab"), resolveRoot("a"))).toBe(false);
});
function resolveRoot(name: string) {
  return process.platform === "win32" ? "C:/" + name : "/" + name;
}
