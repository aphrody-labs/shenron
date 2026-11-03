// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, mock, test } from "bun:test";
import sharp from "sharp";
import {
  adminImageUploadError,
  sniffAdminImage,
  MAX_ADMIN_IMAGE_BYTES,
} from "../src/lib/admin-image-upload";
import { WIKI_TABLE_SPECS } from "../src/lib/wiki-tables";
import { enumOptionsFor } from "../src/lib/wiki-fields";
import { prepareStudioSubmission } from "../src/lib/wiki-studio-draft";

let admin = true;
let authUnavailable = false;
mock.module("server-only", () => ({}));
mock.module("@/lib/session", () => ({
  isCurrentUserAdmin: async () => {
    if (authUnavailable) throw new Error("offline");
    return admin;
  },
}));
mock.module("@/lib/config", () => ({ API_URL: "https://bot.example.test" }));
const { POST } = await import("../src/app/api/admin/upload/route");
const previousFetch = globalThis.fetch;
const previousToken = process.env.SHENRON_ADMIN_TOKEN;
process.env.SHENRON_ADMIN_TOKEN = "test-upload-token";
afterAll(() => {
  globalThis.fetch = previousFetch;
  if (previousToken === undefined) delete process.env.SHENRON_ADMIN_TOKEN;
  else process.env.SHENRON_ADMIN_TOKEN = previousToken;
});
const png = new Uint8Array(
  await sharp({ create: { width: 2, height: 3, channels: 3, background: "white" } })
    .png()
    .toBuffer(),
);
function request(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("subdir", "techniques");
  return new Request("http://localhost/api/admin/upload", { method: "POST", body });
}

test("a technique image can be edited and saved with the canonical snapshot", async () => {
  const columns = WIKI_TABLE_SPECS.db_techniques!.mutableColumns;
  expect(columns).toContain("image");
  const row = { id: 1, name: "Kamehameha", image: null, visible: true };
  const result = await prepareStudioSubmission(
    { name: "Kamehameha", image: "./assets/wiki/techniques/new.png" },
    row,
    ["name", "image"],
    "edit",
  );
  expect(result.image).toBe("./assets/wiki/techniques/new.png");
  expect(result.expected).toEqual(row);
  expect(result.expectedSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(enumOptionsFor("db_techniques", "type")?.strict).not.toBe(true);
});

test("binary validation accepts an image with inaccurate MIME and rejects fake, truncated or empty images", async () => {
  expect(
    await adminImageUploadError(new File([png], "scan.dat", { type: "text/plain" })),
  ).toBeNull();
  expect(
    await adminImageUploadError(new File(["not an image"], "fake.png", { type: "image/png" })),
  ).toBe("invalid");
  expect(await adminImageUploadError(new File([], "empty.png"))).toBe("empty");
  expect(sniffAdminImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull();
  expect(await adminImageUploadError(new Blob([new Uint8Array(MAX_ADMIN_IMAGE_BYTES + 1)]))).toBe(
    "tooLarge",
  );
});

test("admin upload forwards unchanged binary bytes with corrected MIME and bounded authenticated request", async () => {
  admin = true;
  let forwarded = false;
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, options?: RequestInit) => {
      expect(input).toBe("https://bot.example.test/api/assets/upload");
      expect(options?.redirect).toBe("error");
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      const form = options?.body as FormData;
      const file = form.get("file") as File;
      expect(file.type).toBe("image/png");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(png);
      expect(form.get("subdir")).toBe("techniques");
      forwarded = true;
      return Response.json({
        path: "./assets/wiki/techniques/9ef95580-4a8e-45ed-a3ab-113e191b2dcc.png",
      });
    },
    { preconnect: previousFetch.preconnect },
  ) as typeof fetch;
  const response = await POST(
    request(new File([png], "scan.bin", { type: "application/octet-stream" })),
  );
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({
    width: 2,
    height: 3,
    bytes: png.length,
    mime: "image/png",
  });
  expect(forwarded).toBe(true);
});

test("admin upload refuses anonymous access and invalid files before contacting storage", async () => {
  let calls = 0;
  globalThis.fetch = Object.assign(
    async () => {
      calls++;
      return Response.json({});
    },
    { preconnect: previousFetch.preconnect },
  ) as typeof fetch;
  admin = false;
  expect((await POST(request(new File([png], "scan.png")))).status).toBe(403);
  admin = true;
  expect((await POST(request(new File(["fake"], "scan.png", { type: "image/png" })))).status).toBe(
    415,
  );
  expect(calls).toBe(0);
});

test("headers without decodable pixels and unexpected storage URLs never succeed", async () => {
  admin = true;
  const truncated = new File([png.slice(0, 33)], "truncated.png");
  expect((await POST(request(truncated))).status).toBe(415);
  globalThis.fetch = Object.assign(
    async () => Response.json({ path: "https://foreign.example/image.png" }),
    { preconnect: previousFetch.preconnect },
  ) as typeof fetch;
  expect((await POST(request(new File([png], "valid.png")))).status).toBe(502);
});

test("authentication outages and excessive announced bodies have private bounded responses", async () => {
  authUnavailable = true;
  const offline = await POST(request(new File([png], "valid.png")));
  expect(offline.status).toBe(503);
  expect(offline.headers.get("cache-control")).toBe("private, no-store");
  authUnavailable = false;
  expect(
    (
      await POST(
        new Request("http://localhost/api/admin/upload", {
          method: "POST",
          headers: { "content-length": String(MAX_ADMIN_IMAGE_BYTES + 65_537) },
        }),
      )
    ).status,
  ).toBe(413);
});
