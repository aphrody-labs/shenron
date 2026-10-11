// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { OcrResponse } from "../src/contract";
import { createShenronApi, type ShenronApiPorts } from "../src/server";
import { ALICE, basePorts, countingRateLimit, expectApiError, fakeOcr } from "./support/ports";

const OCR = "/api/v1/ocr";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

function setup(o: { fail?: string } = {}, over: Partial<ShenronApiPorts> = {}) {
  const ocr = fakeOcr(o);
  const api = createShenronApi(basePorts({ ocr: ocr.port, ...over }), {
    service: "shenron-server",
  });
  return { api, calls: ocr.calls };
}

const recognize = (body: unknown, headers: Record<string, string> = ALICE): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});
const image = (data: string, mediaType = "image/png") => ({ attachment: { mediaType, data } });

describe("ocr group", () => {
  test("POST only; the group exists only with its port", async () => {
    const { api } = setup();
    expect(api.handles(OCR)).toBe(true);
    const get = await api.request(OCR, { headers: ALICE });
    expect(get.status).toBe(404);
    const none = createShenronApi(basePorts({ ocr: null }), { service: "shenron-server" });
    expect(none.handles(OCR)).toBe(false);
  });

  test("an owner is required: 401 before the body is read", async () => {
    const { api, calls } = setup();
    await expectApiError(await api.request(OCR, recognize(image(base64(PNG)), {})), {
      path: OCR,
      method: "post",
      status: 401,
      code: "unauthenticated",
    });
    expect(calls).toEqual([]);
  });

  test("decoded bytes and media type reach the engine; the answer is an OcrResponse", async () => {
    const { api, calls } = setup();
    const res = await api.request(OCR, recognize({ ...image(base64(PNG)), lang: "ja" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(OcrResponse.parse(await res.json()).text).toBe("ドラゴンボール");
    expect(calls).toHaveLength(1);
    expect([...calls[0]!.bytes]).toEqual([...PNG]);
    expect(calls[0]!.mediaType).toBe("image/png");
  });

  test(
    "body validation: supported image types, base64 of 1 byte to 8 MiB",
    async () => {
      const { api, calls } = setup();
      for (const body of [
        {},
        image(base64(PNG), "image/gif"),
        { attachment: { mediaType: "image/png" } },
      ]) {
        await expectApiError(await api.request(OCR, recognize(body)), {
          path: OCR,
          method: "post",
          status: 400,
          code: "invalid_request",
        });
      }
      for (const data of ["", "!!!!", base64(new Uint8Array(8 * 1024 * 1024 + 1))]) {
        expect(
          await expectApiError(await api.request(OCR, recognize(image(data))), {
            path: OCR,
            method: "post",
            status: 400,
          }),
        ).toEqual({ error: "attachment must hold 1 byte to 8 MiB", code: "invalid_request" });
      }
      expect(calls).toEqual([]);
      // Exactly 8 MiB is accepted.
      const max = await api.request(OCR, recognize(image(base64(new Uint8Array(8 * 1024 * 1024)))));
      expect(max.status).toBe(200);
    },
    process.platform === "win32" ? 60_000 : 5000,
  );

  // Regression: an OCR engine failure was reported as 503 pg_unavailable ("Data store unavailable").
  test("engine failure → 502 upstream_unavailable without the engine output", async () => {
    const { api } = setup({
      fail: "aphrody ocr ppocr failed (exit 101): /home/op/.cache/model.onnx",
    });
    const body = await expectApiError(await api.request(OCR, recognize(image(base64(PNG)))), {
      path: OCR,
      method: "post",
      status: 502,
      code: "upstream_unavailable",
    });
    expect(body).toEqual({ error: "Upstream unavailable", code: "upstream_unavailable" });
  });

  test("OCR spends the chat budget (chat:<ip>), not the public one", async () => {
    const limiter = countingRateLimit(1);
    const { api } = setup({}, { rateLimit: limiter.port });
    const headers = { ...ALICE, "x-real-ip": "192.0.2.77" };
    expect((await api.request(OCR, recognize(image(base64(PNG)), headers))).status).toBe(200);
    const limited = await api.request(OCR, recognize(image(base64(PNG)), headers));
    await expectApiError(limited, { path: OCR, method: "post", status: 429, code: "rate_limited" });
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(limiter.keys).toEqual(["chat:192.0.2.77", "chat:192.0.2.77"]);
  });
});
