// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, mock, test } from "bun:test";
import {
  adminImageUploadError,
  sniffAdminImage,
  MAX_ADMIN_IMAGE_BYTES,
} from "../src/lib/admin-image-upload";
import { WIKI_TABLE_SPECS } from "../src/lib/wiki-tables";
import { enumOptionsFor } from "../src/lib/wiki-fields";
import { prepareStudioSubmission } from "../src/lib/wiki-studio-draft";

let admin = true;
mock.module("@/lib/session", () => ({ isCurrentUserAdmin: async () => admin }));
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
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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
      return Response.json({ path: "./assets/wiki/techniques/scan.png" });
    },
    { preconnect: previousFetch.preconnect },
  ) as typeof fetch;
  const response = await POST(
    request(new File([png], "scan.bin", { type: "application/octet-stream" })),
  );
  expect(response.status).toBe(201);
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
