import { expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const {
  validateSourcePublication,
  publicationSlug,
  publicationDocumentHref,
  readPublicationBody,
  readSourcePublication,
} = await import("../src/lib/public-source-publication");
const body = "Public source text";
const hash = new Bun.CryptoHasher("sha256").update(body).digest("hex");
const doc = {
  sourceUrl: "https://archive.org/details/example",
  title: "Example",
  body: {
    path: `/publications/example/objects/${hash}.md`,
    sha256: hash,
    size: Buffer.byteLength(body),
  },
  media: [],
  children: [],
};
const publication = {
  schema: "shenron-source-publication/v1",
  sourceUrl: doc.sourceUrl,
  targetUrl: "https://dragonballfr.com/publications/example",
  title: "Example",
  publishedAt: "2026-10-13T00:00:00Z",
  documents: [doc],
};
test("publication namespaces and exact target identity stay within the public route", () => {
  expect(publicationSlug("example")).toBe(true);
  for (const slug of ["../admin", "example/other", "Example", "x".repeat(81)])
    expect(publicationSlug(slug)).toBe(false);
  expect(validateSourcePublication(publication, "example").documents.length).toBe(1);
  expect(() =>
    validateSourcePublication(
      { ...publication, targetUrl: "https://foreign.example/publications/example" },
      "example",
    ),
  ).toThrow();
  expect(publicationDocumentHref("example", doc.sourceUrl)).toContain("?source=");
});
test("missing publications are 404 candidates while upstream errors stay errors", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = mock(
    async () => new Response(null, { status: 404 }),
  ) as unknown as typeof fetch;
  try {
    expect(await readSourcePublication("example")).toBeNull();
    globalThis.fetch = mock(
      async () => new Response(null, { status: 503 }),
    ) as unknown as typeof fetch;
    await expect(readSourcePublication("example")).rejects.toThrow("unavailable");
  } finally {
    globalThis.fetch = previous;
  }
});
test("publication graphs reject unknown children and arbitrary object paths", () => {
  expect(() =>
    validateSourcePublication(
      { ...publication, documents: [{ ...doc, children: ["https://archive.org/not-crawled"] }] },
      "example",
    ),
  ).toThrow();
  expect(() =>
    validateSourcePublication(
      { ...publication, documents: [{ ...doc, body: { ...doc.body, path: "/private/cookies" } }] },
      "example",
    ),
  ).toThrow();
  expect(() =>
    validateSourcePublication({ ...publication, documents: [doc, doc] }, "example"),
  ).toThrow();
  expect(() =>
    validateSourcePublication({ ...publication, documents: [{ ...doc, body: {} }] }, "example"),
  ).toThrow();
});
test("public body fetch verifies exact size and digest without cookies or stale cache", async () => {
  const previous = globalThis.fetch;
  let options: RequestInit | undefined;
  globalThis.fetch = mock(async (_input: unknown, init?: RequestInit) => {
    options = init;
    return new Response(body);
  }) as unknown as typeof fetch;
  try {
    expect(await readPublicationBody(doc)).toBe(body);
    expect(options?.credentials).toBe("omit");
    expect(options?.cache).toBe("no-store");
    await expect(
      readPublicationBody({ ...doc, body: { ...doc.body, sha256: "0".repeat(64) } }),
    ).rejects.toThrow("integrity");
  } finally {
    globalThis.fetch = previous;
  }
});
