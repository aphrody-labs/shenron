// SPDX-License-Identifier: Apache-2.0
// Minimal S3 SigV4 client (path style) shared by the R2 -> Garage mirror, the parity check and the
// Garage-backed CDN origin. Works against Garage and Cloudflare R2; no dependency beyond Bun.
import { createHash, createHmac } from "node:crypto";

export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface S3Listed {
  key: string;
  size: number;
  etag: string;
}

export interface S3Head {
  size: number;
  etag: string;
  headers: Headers;
}

export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export const sha256Hex = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: Uint8Array | string, data: string) =>
  createHmac("sha256", key).update(data).digest();

const encodeRfc3986 = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const encodeKey = (key: string) => key.split("/").map(encodeRfc3986).join("/");

export class S3Error extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class S3 {
  constructor(readonly config: S3Config) {}

  private url(key: string, query: Record<string, string>) {
    const base = this.config.endpoint.replace(/\/+$/, "");
    const path = `/${encodeRfc3986(this.config.bucket)}${key ? `/${encodeKey(key)}` : ""}`;
    const qs = Object.entries(query)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
      .join("&");
    return { href: `${base}${path}${qs ? `?${qs}` : ""}`, path, qs };
  }

  async request(
    method: string,
    key: string,
    options: {
      query?: Record<string, string>;
      headers?: Record<string, string>;
      body?: Uint8Array;
      signal?: AbortSignal;
    } = {},
  ): Promise<Response> {
    const { endpoint, region, accessKeyId, secretAccessKey } = this.config;
    const { href, path, qs } = this.url(key, options.query ?? {});
    const host = new URL(endpoint).host;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const day = amzDate.slice(0, 8);
    const payloadHash = options.body ? sha256Hex(options.body) : EMPTY_SHA256;
    const headers: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
      ),
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    const names = Object.keys(headers).toSorted();
    const canonical = [
      method,
      path,
      qs,
      ...names.map((name) => `${name}:${String(headers[name]).trim()}`),
      "",
      names.join(";"),
      payloadHash,
    ].join("\n");
    const scope = `${day}/${region}/s3/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonical)].join("\n");
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), "s3"),
      "aws4_request",
    );
    const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
    delete headers.host;
    return fetch(href, {
      method,
      headers,
      body: options.body as BodyInit | undefined,
      signal: options.signal,
      redirect: "manual",
    });
  }

  async head(key: string): Promise<S3Head | null> {
    const response = await this.request("HEAD", key);
    if (response.status === 404) return null;
    if (!response.ok) throw new S3Error(response.status, `HEAD ${key}: ${response.status}`);
    return {
      size: Number(response.headers.get("content-length")),
      etag: (response.headers.get("etag") ?? "").replaceAll('"', ""),
      headers: response.headers,
    };
  }

  /** GET with an optional inclusive byte range; resolves null on 404, the live Response otherwise. */
  async get(key: string, range?: { offset: number; length: number }, signal?: AbortSignal) {
    const response = await this.request("GET", key, {
      signal,
      // identity: R2 would otherwise gzip text objects, breaking the byte count and the hash.
      headers: {
        "accept-encoding": "identity",
        ...(range ? { range: `bytes=${range.offset}-${range.offset + range.length - 1}` } : {}),
      },
    });
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new S3Error(response.status, `GET ${key}: ${response.status}`);
    }
    return response;
  }

  async *list(prefix = ""): AsyncGenerator<S3Listed> {
    let token: string | undefined;
    do {
      const response = await this.request("GET", "", {
        query: {
          "list-type": "2",
          "encoding-type": "url",
          "max-keys": "1000",
          ...(prefix ? { prefix } : {}),
          ...(token ? { "continuation-token": token } : {}),
        },
      });
      const xml = await response.text();
      if (!response.ok)
        throw new S3Error(response.status, `LIST: ${response.status} ${xml.slice(0, 200)}`);
      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const body = match[1]!;
        const field = (tag: string) =>
          new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body)?.[1] ?? "";
        yield {
          key: decodeURIComponent(field("Key").replaceAll("+", " ")),
          size: Number(field("Size")),
          etag: field("ETag").replaceAll("&quot;", "").replaceAll('"', ""),
        };
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? decodeURIComponent(
            /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)![1]!,
          )
        : undefined;
    } while (token);
  }

  async put(key: string, body: Uint8Array, headers: Record<string, string> = {}) {
    const response = await this.request("PUT", key, { body, headers });
    const text = await response.text();
    if (!response.ok)
      throw new S3Error(response.status, `PUT ${key}: ${response.status} ${text.slice(0, 200)}`);
  }

  async createMultipart(key: string, headers: Record<string, string> = {}) {
    const response = await this.request("POST", key, { query: { uploads: "" }, headers });
    const text = await response.text();
    const id = /<UploadId>([\s\S]*?)<\/UploadId>/.exec(text)?.[1];
    if (!response.ok || !id)
      throw new S3Error(response.status, `CreateMultipart ${key}: ${response.status}`);
    return id;
  }

  async uploadPart(key: string, uploadId: string, part: number, body: Uint8Array) {
    const response = await this.request("PUT", key, {
      query: { partNumber: String(part), uploadId },
      body,
    });
    await response.arrayBuffer();
    const etag = response.headers.get("etag");
    if (!response.ok || !etag)
      throw new S3Error(response.status, `UploadPart ${key}#${part}: ${response.status}`);
    return etag;
  }

  async completeMultipart(key: string, uploadId: string, etags: string[]) {
    const xml = `<CompleteMultipartUpload>${etags
      .map((etag, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etag}</ETag></Part>`)
      .join("")}</CompleteMultipartUpload>`;
    const response = await this.request("POST", key, {
      query: { uploadId },
      body: new TextEncoder().encode(xml),
    });
    const text = await response.text();
    if (!response.ok || /<Error>/.test(text))
      throw new S3Error(
        response.status,
        `CompleteMultipart ${key}: ${response.status} ${text.slice(0, 200)}`,
      );
  }

  async abortMultipart(key: string, uploadId: string) {
    const response = await this.request("DELETE", key, { query: { uploadId } });
    await response.arrayBuffer();
  }
}
