// SPDX-License-Identifier: Apache-2.0
import type { SignedClient } from "./transfer";

export interface NativeS3Credentials {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}
export interface NativeS3Curl {
  readonly available: boolean;
  request(
    url: string,
    options: {
      method: string;
      headers: string[];
      body?: string | ArrayBufferView | ArrayBuffer;
      timeout: number;
      maxBytes: number;
      followRedirects: false;
      maxRedirects: 0;
      signal: AbortSignal;
      options: Record<string, string>;
    },
  ): Promise<{ status: number; body: Blob; headers: string }>;
}
function failure(code: string): Error {
  return Object.assign(new Error(code), { code });
}
function responseHeaders(raw: string): Headers {
  if (raw.length > 65536) throw failure("ERR_S3_RESPONSE_HEADERS");
  let headers = new Headers();
  for (const line of raw.split(/\r?\n/)) {
    if (/^HTTP\/\S+\s+\d{3}/.test(line)) {
      headers = new Headers();
      continue;
    }
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 1 || /^[ \t]/.test(line)) throw failure("ERR_S3_RESPONSE_HEADERS");
    headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
  }
  return headers;
}

/** Native libcurl owns AWS SigV4. Credentials never enter child argv or a JS signer. */
export function nativeS3Signer(
  credentials: NativeS3Credentials,
  provider: NativeS3Curl | undefined = (Bun as unknown as { Curl?: NativeS3Curl }).Curl,
): SignedClient {
  if (!provider?.available) throw failure("ERR_CURL_PROVIDER_UNAVAILABLE");
  const endpoint = new URL(credentials.endpoint),
    prefix = "/" + credentials.bucket + "/";
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/" ||
    !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname) ||
    endpoint.port ||
    !/^[a-z0-9][a-z0-9-]{1,62}$/.test(credentials.bucket) ||
    [credentials.accessKeyId, credentials.secretAccessKey, credentials.sessionToken].some(
      (value) => !value || /[\r\n\0]/.test(value),
    ) ||
    credentials.accessKeyId.includes(":")
  )
    throw failure("ERR_S3_SIGNER_SCOPE");
  return {
    async fetch(url, init) {
      const target = new URL(url),
        method = init.method ?? "GET";
      if (
        target.origin !== endpoint.origin ||
        !target.pathname.startsWith(prefix) ||
        target.username ||
        target.password ||
        target.search ||
        target.hash ||
        !["GET", "HEAD", "PUT"].includes(method) ||
        (init.redirect && init.redirect !== "error" && init.redirect !== "manual")
      )
        throw failure("ERR_S3_SIGNER_SCOPE");
      const headers = new Headers(init.headers);
      for (const name of ["authorization", "host", "x-amz-date", "x-amz-security-token"])
        if (headers.has(name)) throw failure("ERR_S3_SIGNER_HEADERS");
      headers.set("x-amz-security-token", credentials.sessionToken);
      const body = init.body;
      if (
        body != null &&
        typeof body !== "string" &&
        !(body instanceof ArrayBuffer) &&
        !ArrayBuffer.isView(body)
      )
        throw failure("ERR_S3_SIGNER_BODY");
      init.signal?.throwIfAborted();
      const result = await provider.request(target.href, {
        method,
        headers: [...headers].map(([name, value]) => name + ": " + value),
        ...(body != null ? { body } : {}),
        timeout: 120000,
        maxBytes: 128 * 1024 * 1024,
        followRedirects: false,
        maxRedirects: 0,
        signal: init.signal ?? AbortSignal.timeout(120000),
        options: {
          AWS_SIGV4: "aws:amz:auto:s3",
          USERPWD: credentials.accessKeyId + ":" + credentials.secretAccessKey,
        },
      });
      if (result.status < 200 || result.status > 599) throw failure("ERR_S3_RESPONSE_STATUS");
      return new Response(
        method === "HEAD" || [204, 205, 304].includes(result.status) ? null : result.body,
        { status: result.status, headers: responseHeaders(result.headers) },
      );
    },
  };
}
