// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  handleCdn,
  manifestKey,
  type CdnBucket,
  type ManifestEntry,
  type StoredObject,
  type OriginFetch,
} from "./cdn-worker";

const bytes = new TextEncoder().encode("verified-font");
const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const entry: ManifestEntry = {
  sha256,
  size: bytes.length,
  contentType: "font/woff2",
  cacheControl: "public, max-age=31536000, immutable",
};

class Bucket implements CdnBucket {
  entries: Record<string, ManifestEntry> = { "/fonts/a.woff2": entry, "/fonts/alias.woff2": entry };
  objects = new Map<string, Uint8Array>();
  puts = 0;
  reads: string[] = [];
  missingManifest = false;
  metadata(data: Uint8Array): StoredObject {
    return {
      size: data.length,
      customMetadata: { sha256: new Bun.CryptoHasher("sha256").update(data).digest("hex") },
      json: async <T>() => this.entries as T,
    };
  }
  async head(key: string) {
    const data = this.objects.get(key);
    return data ? this.metadata(data) : null;
  }
  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    this.reads.push(key);
    if (key.startsWith("_migration/")) {
      const stored = this.objects.get(key);
      if (stored)
        return {
          ...this.metadata(stored),
          json: async <T>() => JSON.parse(new TextDecoder().decode(stored)) as T,
        };
      return this.missingManifest ? null : this.metadata(bytes);
    }
    const data = this.objects.get(key);
    if (!data) return null;
    const range = options?.range;
    const result = range ? data.slice(range.offset, range.offset + range.length) : data;
    return { ...this.metadata(data), body: new Blob([new Uint8Array(result).buffer]).stream() };
  }
  async put(
    key: string,
    body: ReadableStream<Uint8Array>,
    options: {
      sha256: string;
      httpMetadata: { contentType: string; cacheControl: string };
      customMetadata: { sha256: string };
    },
  ) {
    this.puts++;
    const data = new Uint8Array(await new Response(body).arrayBuffer());
    // Emulate R2's mandatory checksum validation before committing any object.
    if (new Bun.CryptoHasher("sha256").update(data).digest("hex") !== options.sha256)
      throw new Error("checksum mismatch");
    expect(options.httpMetadata).toEqual(
      key.startsWith("_migration/")
        ? { contentType: "application/json", cacheControl: "private, no-store" }
        : { contentType: entry.contentType, cacheControl: entry.cacheControl },
    );
    expect(options.customMetadata).toEqual({ sha256: options.sha256 });
    this.objects.set(key, data);
    return this.metadata(data);
  }
}

function request(path = "/fonts/a.woff2", method = "GET", headers?: HeadersInit) {
  return new Request(`https://cdn.example${path}`, { method, headers });
}

describe("CDN manifest and import", () => {
  test("REST uploads are checksum-verified before attaching serving metadata", async () => {
    class UploadedBucket extends Bucket {
      attached = false;
      override metadata(data: Uint8Array): StoredObject {
        const value = super.metadata(data);
        return this.attached ? value : { ...value, customMetadata: undefined };
      }
      override async put(...args: Parameters<Bucket["put"]>) {
        await super.put(...args);
        this.attached = true;
        return this.metadata(this.objects.get(args[0])!);
      }
    }
    const key = `_objects/${sha256}`;
    const bucket = new UploadedBucket();
    bucket.objects.set(key, bytes);
    expect((await handleCdn(request(), { CDN: bucket, VERIFY_UPLOADS: "true" })).status).toBe(503);
    expect((await handleCdn(request(undefined, "HEAD"), { CDN: bucket })).status).toBe(503);
    expect(bucket.puts).toBe(0);
    const verified = await handleCdn(request(undefined, "HEAD"), {
      CDN: bucket,
      VERIFY_UPLOADS: "true",
    });
    expect(verified.status).toBe(200);
    expect(verified.headers.get("X-Content-SHA256")).toBe(sha256);
    expect(verified.headers.get("X-Content-Size")).toBe(String(bytes.length));
    expect(bucket.puts).toBe(1);
    expect(await (await handleCdn(request(), { CDN: bucket })).text()).toBe("verified-font");
    const wrong = new UploadedBucket();
    wrong.objects.set(key, new Uint8Array(bytes.length));
    expect(
      (await handleCdn(request(undefined, "HEAD"), { CDN: wrong, VERIFY_UPLOADS: "true" })).status,
    ).toBe(503);
    expect(wrong.attached).toBe(false);
    expect(wrong.objects.get(key)).toEqual(new Uint8Array(bytes.length));
  });
  test("bootstrap imports a pinned manifest shard without serving its private URL", async () => {
    const bucket = new Bucket();
    bucket.missingManifest = true;
    const key = await manifestKey("/fonts/a.woff2");
    const shard = key.slice(-7, -5);
    const text = JSON.stringify(bucket.entries);
    const hash = new Bun.CryptoHasher("sha256").update(text).digest("hex");
    let fetches = 0;
    const origin: OriginFetch = async (input, init) => {
      fetches++;
      expect(input).toBe(
        `https://cdn.dragonballfr.com/assets/ext/cf-migrate-20261011/manifests/${shard}.json`,
      );
      expect(init).toEqual({
        method: "GET",
        redirect: "manual",
        headers: { "Accept-Encoding": "identity" },
      });
      return new Response(text);
    };
    const env = {
      CDN: bucket,
      IMPORT_ENABLED: "true",
      ["MANIFEST_SHARD_HASHES_" + Math.floor(Number.parseInt(shard, 16) / 64)]: { [shard]: hash },
    };
    expect((await handleCdn(request(), env, origin)).status).toBe(503);
    expect(bucket.puts).toBe(1);
    expect(bucket.objects.has(key)).toBe(true);
    expect(bucket.objects.has(`_objects/${sha256}`)).toBe(false);
    bucket.objects.set(`_objects/${sha256}`, bytes);
    expect((await handleCdn(request(), env, origin)).status).toBe(200);
    expect(fetches).toBe(1);
    expect(
      (
        await handleCdn(
          request(`/assets/ext/cf-migrate-20261011/manifests/${shard}.json`),
          env,
          origin,
        )
      ).status,
    ).toBe(404);
  });

  test("bootstrap rejects hash mismatch, over-limit bodies and disabled import", async () => {
    const key = await manifestKey("/fonts/a.woff2");
    const shard = key.slice(-7, -5);
    for (const source of [
      new Response("wrong"),
      new Response(new Uint8Array(2 * 1024 * 1024 + 1)),
      new Response("{}", { headers: { "Content-Length": "2097153" } }),
    ]) {
      const bucket = new Bucket();
      bucket.missingManifest = true;
      const origin: OriginFetch = async () => source;
      expect(
        (
          await handleCdn(
            request(),
            { CDN: bucket, IMPORT_ENABLED: "true", MANIFEST_SHARD_HASHES: { [shard]: sha256 } },
            origin,
          )
        ).status,
      ).toBe(503);
      expect(bucket.puts).toBe(0);
    }
    const bucket = new Bucket();
    bucket.missingManifest = true;
    let fetches = 0;
    const origin: OriginFetch = async () => {
      fetches++;
      return new Response("{}");
    };
    expect(
      (
        await handleCdn(
          request(),
          { CDN: bucket, MANIFEST_SHARD_HASHES: { [shard]: sha256 } },
          origin,
        )
      ).status,
    ).toBe(503);
    expect(
      (await handleCdn(request(), { CDN: bucket, IMPORT_ENABLED: "true" }, origin)).status,
    ).toBe(503);
    expect(fetches).toBe(0);
  });
  test("public Next assets and well-known agent cards remain manifest-gated", async () => {
    const bucket = new Bucket();
    bucket.entries["/_next/static/chunks/artifact.js"] = {
      ...entry,
      contentType: "application/javascript",
    };
    bucket.entries["/.well-known/agent-card.json"] = { ...entry, contentType: "application/json" };
    bucket.entries["/_next/static/build/_buildManifest.js"] = {
      ...entry,
      contentType: "application/javascript",
    };
    bucket.entries["/games/dragon-pixel/portraits/_QA.png"] = {
      ...entry,
      contentType: "image/png",
    };
    bucket.objects.set(`_objects/${sha256}`, bytes);
    for (const path of [
      "/_next/static/chunks/artifact.js",
      "/.well-known/agent-card.json",
      "/_next/static/build/_buildManifest.js",
      "/games/dragon-pixel/portraits/_QA.png",
    ]) {
      const response = await handleCdn(request(path), { CDN: bucket });
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Content-SHA256")).toBe(sha256);
      expect(await response.text()).toBe("verified-font");
    }
    for (const path of [
      "/_next/server/private.js",
      "/_other/static/file.js",
      "/.other/card.json",
      "/.well-known/.env",
      "/_next/static/_private/file.js",
      "/.well-known/unmapped.json",
    ]) {
      expect((await handleCdn(request(path), { CDN: bucket })).status).toBe(404);
    }
  });
  test("uses the decoded leading-slash path hash and never exposes unknown/private paths", async () => {
    const bucket = new Bucket();
    const env = { CDN: bucket, IMPORT_ENABLED: "true" };
    const expected = new Bun.CryptoHasher("sha256")
      .update("/fonts/a.woff2")
      .digest("hex")
      .slice(0, 2);
    expect(await manifestKey("/fonts/a.woff2")).toBe(`_migration/manifests/${expected}.json`);
    for (const path of [
      "/unknown.png",
      "/.env",
      "/db.sql",
      "/_migration/manifests/ab.json",
      "/private/photo.jpg",
      "/manifests/public.json",
      "/%ZZ",
      "/foo/%00bar",
    ]) {
      expect((await handleCdn(request(path), env)).status).toBe(404);
    }
    expect((await handleCdn(request("/fonts/a.woff2", "POST"), env)).status).toBe(405);
    expect(bucket.puts).toBe(0);
    bucket.missingManifest = true;
    expect((await handleCdn(request(), env)).status).toBe(503);
  });

  test("GET never imports, HEAD imports with checksum and aliases reuse the same object", async () => {
    const bucket = new Bucket();
    const env = { CDN: bucket, IMPORT_ENABLED: "true" };
    let fetches = 0;
    const origin = (async (input, init) => {
      fetches++;
      expect(input).toBe("https://cdn.dragonballfr.com/fonts/a.woff2");
      expect(init).toEqual({
        method: "GET",
        redirect: "manual",
        headers: { "Accept-Encoding": "identity" },
      });
      return new Response(bytes, { headers: { "Content-Length": String(bytes.length) } });
    }) as OriginFetch;
    expect((await handleCdn(request(), env, origin)).status).toBe(503);
    expect(fetches).toBe(0);
    const head = await handleCdn(
      request("/fonts/a.woff2", "HEAD", {
        Authorization: "must-not-forward",
        Cookie: "private",
        Range: "bytes=0-1",
      }),
      env,
      origin,
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("X-Content-SHA256")).toBe(sha256);
    expect(head.headers.get("Content-Length")).toBe(String(bytes.length));
    expect(await head.text()).toBe("");
    const alias = await handleCdn(request("/fonts/alias.woff2", "HEAD"), env, origin);
    expect(alias.status).toBe(200);
    expect(fetches).toBe(1);
    expect(bucket.puts).toBe(1);
    expect(await (await handleCdn(request(), env)).text()).toBe("verified-font");
  });

  test("checksum mismatch cannot become a stored object", async () => {
    const bucket = new Bucket();
    const origin = (async () =>
      new Response("tampered-font", {
        headers: { "Content-Length": String(bytes.length) },
      })) as OriginFetch;
    expect(
      (
        await handleCdn(
          request("/fonts/a.woff2", "HEAD"),
          { CDN: bucket, IMPORT_ENABLED: "true" },
          origin,
        )
      ).status,
    ).toBe(503);
    expect(bucket.objects.size).toBe(0);
  });

  test("redirects, wrong length, encoding and disabled import cannot copy", async () => {
    for (const [status, headers] of [
      [302, { Location: "https://evil.example" }],
      [200, { "Content-Length": "99" }],
      [200, { "Content-Length": String(bytes.length), "Content-Encoding": "gzip" }],
    ] as const) {
      const bucket = new Bucket();
      const origin = (async () => new Response(bytes, { status, headers })) as OriginFetch;
      expect(
        (
          await handleCdn(
            request("/fonts/a.woff2", "HEAD"),
            { CDN: bucket, IMPORT_ENABLED: "true" },
            origin,
          )
        ).status,
      ).toBe(503);
      expect(bucket.puts).toBe(0);
    }
    const bucket = new Bucket();
    const origin = (async () => {
      throw new Error("must not fetch");
    }) as OriginFetch;
    expect(
      (await handleCdn(request("/fonts/a.woff2", "HEAD"), { CDN: bucket }, origin)).status,
    ).toBe(503);
    expect(bucket.puts).toBe(0);
  });

  test("ranges, conditional GET and public font CORS", async () => {
    const bucket = new Bucket();
    bucket.objects.set(`_objects/${sha256}`, bytes);
    const env = { CDN: bucket };
    const partial = await handleCdn(request(undefined, "GET", { Range: "bytes=0-7" }), env);
    expect(partial.status).toBe(206);
    expect(partial.headers.get("Content-Range")).toBe(`bytes 0-7/${bytes.length}`);
    expect(partial.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await partial.text()).toBe("verified");
    expect(
      await (await handleCdn(request(undefined, "GET", { Range: "bytes=-4" }), env)).text(),
    ).toBe("font");
    const conditional = await handleCdn(
      request(undefined, "GET", { "If-None-Match": `W/"${sha256}"` }),
      env,
    );
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
    expect(
      (await handleCdn(request(undefined, "GET", { Range: "bytes=99-100" }), env)).status,
    ).toBe(416);
    expect(
      (await handleCdn(request(undefined, "GET", { Range: "bytes=0-1,3-4" }), env)).status,
    ).toBe(416);
    expect(
      (
        await handleCdn(
          request(undefined, "GET", { Range: "bytes=0-1", "If-Range": '"different"' }),
          env,
        )
      ).status,
    ).toBe(200);
  });
});
