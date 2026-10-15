import { expect, test } from "bun:test";
import { nativeS3Signer, type NativeS3Curl } from "./native-s3-signer";

const credentials = {
  endpoint: "https://" + "a".repeat(32) + ".r2.cloudflarestorage.com",
  bucket: "fixture-bucket",
  accessKeyId: "fixture-access",
  secretAccessKey: "fixture-secret",
  sessionToken: "fixture-token",
};
const target = credentials.endpoint + "/fixture-bucket/_objects/" + "b".repeat(64);
test("native S3 adapter sends binary metadata and scoped credentials to the native signer only", async () => {
  const calls: Parameters<NativeS3Curl["request"]>[] = [];
  const provider: NativeS3Curl = {
    available: true,
    async request(...args) {
      calls.push(args);
      return {
        status: 200,
        body: new Blob(["bytes"]),
        headers:
          "HTTP/1.1 100 Continue\r\nx-old: ignored\r\n\r\nHTTP/1.1 200 OK\r\nx-amz-meta-sha256: digest\r\ncontent-type: image/png\r\n\r\n",
      };
    },
  };
  const signer = nativeS3Signer(credentials, provider),
    bytes = new Uint8Array([99, 0, 255, 128, 99]).subarray(1, 4);
  const result = await signer.fetch(target, {
    method: "PUT",
    body: bytes,
    headers: {
      "x-amz-meta-sha256": "digest",
      "x-amz-checksum-sha256": "checksum",
      "cache-control": "immutable",
    },
  });
  expect(result.status).toBe(200);
  expect(await result.text()).toBe("bytes");
  expect(result.headers.get("x-amz-meta-sha256")).toBe("digest");
  expect(result.headers.has("x-old")).toBe(false);
  const [url, options] = calls[0]!;
  expect(url).toBe(target);
  expect(options.body).toBe(bytes);
  expect(options.options).toEqual({
    AWS_SIGV4: "aws:amz:auto:s3",
    USERPWD: "fixture-access:fixture-secret",
  });
  expect(options.headers).toContain("x-amz-security-token: fixture-token");
  expect(options.headers).toContain("x-amz-meta-sha256: digest");
  expect(options.headers).toContain("x-amz-checksum-sha256: checksum");
  expect(options.followRedirects).toBe(false);
  expect(options.maxRedirects).toBe(0);
  const head = await signer.fetch(target, { method: "HEAD" });
  expect(head.body).toBeNull();
  await signer.fetch(target, {
    method: "PUT",
    headers: {
      "x-amz-copy-source": "/fixture-bucket/_objects/source",
      "x-amz-copy-source-if-match": "etag",
      "cf-copy-destination-if-match": "etag",
      "x-amz-metadata-directive": "MERGE",
    },
  });
  expect(calls[2]![1].headers).toContain("cf-copy-destination-if-match: etag");
});
test("native S3 adapter refuses unavailable providers, origin changes and unsafe overrides before requests", async () => {
  expect(() =>
    nativeS3Signer(credentials, {
      available: false,
      async request() {
        throw Error("unused");
      },
    }),
  ).toThrow("ERR_CURL_PROVIDER_UNAVAILABLE");
  let calls = 0;
  const signer = nativeS3Signer(credentials, {
    available: true,
    async request() {
      calls++;
      throw Error("unexpected");
    },
  });
  for (const url of [
    target.replace("a".repeat(32), "c".repeat(32)),
    target + "?credentials=bad",
    credentials.endpoint + "/other-bucket/key",
  ])
    await expect(signer.fetch(url, { method: "HEAD" })).rejects.toThrow("ERR_S3_SIGNER_SCOPE");
  await expect(
    signer.fetch(target, { method: "HEAD", headers: { Authorization: "override" } }),
  ).rejects.toThrow("ERR_S3_SIGNER_HEADERS");
  await expect(
    signer.fetch(target, { method: "PUT", body: new Blob(["unsupported"]) }),
  ).rejects.toThrow("ERR_S3_SIGNER_BODY");
  const controller = new AbortController();
  controller.abort();
  await expect(signer.fetch(target, { signal: controller.signal })).rejects.toThrow();
  expect(calls).toBe(0);
});
