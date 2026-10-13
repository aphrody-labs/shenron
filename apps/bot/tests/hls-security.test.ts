import "./setup";
import { expect, test } from "bun:test";
import { readHlsSegment, registerHlsSegment } from "../src/api/hls-security";
import { hlsDownload } from "../src/api/server";

test("public HLS segments expose an opaque handle instead of upstream credentials", () => {
  const source = "https://upstream.example/segment.ts?token=private";
  const referer = "https://upstream.example/watch";
  const handle = registerHlsSegment(source, referer);
  expect(handle).toMatch(/^[a-f0-9-]{36}$/i);
  expect(handle).not.toContain("private");
  expect(readHlsSegment(handle)).toEqual({ url: source, referer });
  expect(readHlsSegment("invalid")).toBeNull();
});

test("legacy download refuses media without a publication attestation", async () => {
  const response = hlsDownload();
  expect(response.status).toBe(404);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("content-disposition")).toBeNull();
});
