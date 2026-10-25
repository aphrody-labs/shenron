// SPDX-License-Identifier: Apache-2.0
import { expect, spyOn, test } from "bun:test";
import {
  prepareGeneratedArtworkUpdate,
  publishGeneratedArtwork,
  type GeneratedVariantArtwork,
} from "../scripts/publish-generated-variant-artwork";
const entry: GeneratedVariantArtwork = {
  id: 2118,
  characterId: 1,
  slug: "goku-namek",
  file: "reviewed.png",
  sha256: "a".repeat(64),
  generatedAt: "2026-10-25T13:00:00Z",
  reference: {
    url: "https://dragonballfr.com/wiki/manga/1443?page=134",
    imageUrl: "https://cdn.dragonballfr.com/assets/manga/DB/regular/vol24/134.webp",
    title: "Dragon Ball, tome 24, planche 134",
    sha256: "b".repeat(64),
  },
};
const evidence = {
  methode: "ocr-manga",
  tomes: [24],
  planches: 84,
  graphies: ["goku"],
  mesureAt: 123,
};
const row = { id: 2118, characterId: 1, slug: "goku-namek", visible: true, image: null, evidence };
const image = "./assets/wiki/generated-portraits/reviewed.png";
test("generated artwork preserves documentary measurements and records its separate provenance", () => {
  const body = prepareGeneratedArtworkUpdate(entry, row, image)!;
  expect(body.evidence).toMatchObject(evidence);
  expect(body.evidence.imageArtwork).toMatchObject({
    kind: "generated",
    image,
    referenceUrl: entry.reference.url,
    generator: "image_gen",
    outputSha256: entry.sha256,
  });
  expect(body.expected).toEqual(row);
  expect(row.evidence).toEqual(evidence);
  expect(body.expectedSha256).toMatch(/^[a-f0-9]{64}$/);
});
test("generated artwork refuses existing images, identity drift and unreviewed origins", () => {
  expect(() =>
    prepareGeneratedArtworkUpdate(entry, { ...row, image: "official.jpg" }, image),
  ).toThrow("preserved");
  expect(() => prepareGeneratedArtworkUpdate(entry, { ...row, slug: "goku-cell" }, image)).toThrow(
    "drifted",
  );
  expect(() =>
    prepareGeneratedArtworkUpdate(entry, row, "https://external.example/image.png"),
  ).toThrow("upload path");
  expect(() =>
    prepareGeneratedArtworkUpdate(
      { ...entry, reference: { ...entry.reference, imageUrl: "https://external.example/ref.png" } },
      row,
      image,
    ),
  ).toThrow("reference");
  expect(() => prepareGeneratedArtworkUpdate(entry, { ...row, evidence: null }, image)).toThrow(
    "evidence required",
  );
});

test("publishing keeps credentials on the site and independently checks uploaded bytes and metadata", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const file = `${process.env.TEMP}/shenron-artwork-${crypto.randomUUID()}.png`;
  const fixture = { ...entry, file, sha256, reference: { ...entry.reference, sha256 } };
  await Bun.write(file, bytes);
  const token = process.env.SHENRON_ADMIN_TOKEN;
  process.env.SHENRON_ADMIN_TOKEN = "test-fixture-token";
  let saved = { ...row } as Record<string, unknown>;
  let patches = 0;
  let uploads = 0;
  const fakeFetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      if (url.origin !== "https://dragonballfr.com") {
        expect(headers.has("authorization")).toBe(false);
        expect(headers.has("cookie")).toBe(false);
        return new Response(bytes);
      }
      expect(headers.get("authorization")).toBe("Bearer test-fixture-token");
      if (url.pathname === "/api/admin/upload") {
        uploads++;
        const form = init?.body;
        if (!(form instanceof FormData)) throw new Error("Expected multipart upload");
        expect(form.get("subdir")).toBe("generated-portraits");
        return Response.json({ path: image }, { status: 201 });
      }
      if (init?.method === "PATCH") {
        patches++;
        const body = JSON.parse(String(init.body));
        expect(body.expected).toEqual(row);
        saved = { ...saved, image: body.image, evidence: body.evidence };
        return Response.json({ ok: true, row: saved });
      }
      return Response.json(saved);
    },
    { preconnect: globalThis.fetch.preconnect },
  );
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(fakeFetch);
  try {
    expect(await publishGeneratedArtwork([fixture], true)).toEqual([
      { id: 2118, image, status: "applied-and-read-back" },
    ]);
    expect(uploads).toBe(1);
    expect(patches).toBe(1);
    expect(saved.evidence).toMatchObject(evidence);
  } finally {
    fetchSpy.mockRestore();
    if (token === undefined) delete process.env.SHENRON_ADMIN_TOKEN;
    else process.env.SHENRON_ADMIN_TOKEN = token;
    await Bun.file(file).delete();
  }
});
