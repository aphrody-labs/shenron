// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { handleCdn, manifestKey } from "../cloudflare/cdn-worker";
import { garageBucket } from "./cdn-origin";
import { S3, sha256Hex } from "./s3";

const body = new TextEncoder().encode("garage-served-font");
const sha256 = sha256Hex(body);
const prefix = "_migration/manifests/publication-test/";

/** In-memory S3 double answering the subset of calls the adapter makes. */
function fakeS3(objects: Map<string, Uint8Array>) {
  const s3 = new S3({
    endpoint: "http://127.0.0.1:1",
    region: "garage",
    accessKeyId: "k",
    secretAccessKey: "s",
    bucket: "b",
  });
  s3.head = async (key) => {
    const data = objects.get(key);
    return data ? { size: data.length, etag: "", headers: new Headers() } : null;
  };
  s3.get = async (key, range) => {
    const data = objects.get(key);
    if (!data) return null;
    const slice = range ? data.slice(range.offset, range.offset + range.length) : data;
    return new Response(slice as BodyInit, {
      status: range ? 206 : 200,
      headers: range
        ? {
            "content-range": `bytes ${range.offset}-${range.offset + range.length - 1}/${data.length}`,
          }
        : { "content-length": String(data.length) },
    });
  };
  return s3;
}

async function environment() {
  const key = await manifestKey("/fonts/a.woff2", prefix);
  const objects = new Map<string, Uint8Array>([
    [
      key,
      new TextEncoder().encode(
        JSON.stringify({
          "/fonts/a.woff2": {
            sha256,
            size: body.length,
            contentType: "font/woff2",
            cacheControl: "public, max-age=31536000, immutable",
          },
        }),
      ),
    ],
    [`_objects/${sha256}`, body],
    [await manifestKey("/fonts/missing.woff2", prefix), new TextEncoder().encode("{}")],
  ]);
  return { CDN: garageBucket(fakeS3(objects)), MANIFEST_PREFIX: prefix };
}

test("serves a manifest path from Garage with the digest headers", async () => {
  const response = await handleCdn(
    new Request("https://cdn.example/fonts/a.woff2", {
      headers: { "accept-encoding": "identity" },
    }),
    await environment(),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("x-content-sha256")).toBe(sha256);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
});

test("serves byte ranges and refuses unknown paths", async () => {
  const env = await environment();
  const ranged = await handleCdn(
    new Request("https://cdn.example/fonts/a.woff2", { headers: { range: "bytes=0-5" } }),
    env,
  );
  expect(ranged.status).toBe(206);
  expect(await ranged.text()).toBe("garage");
  expect(
    (await handleCdn(new Request("https://cdn.example/fonts/missing.woff2"), env)).status,
  ).toBe(404);
});

test("the Garage bucket adapter is read only", async () => {
  const env = await environment();
  await expect(
    env.CDN.put("k", new Blob([]).stream(), {
      sha256,
      httpMetadata: { contentType: "a/b", cacheControl: "x" },
      customMetadata: { sha256 },
    }),
  ).rejects.toThrow("read only");
});
