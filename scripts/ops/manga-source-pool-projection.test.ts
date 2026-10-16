// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquisitionCandidate,
  projectPoolReceipts,
  projectionDigest,
  textFromPoolHtml,
  type Capture,
} from "./manga-source-pool-projection";
const temporary: string[] = [];
afterEach(async () => {
  for (const p of temporary.splice(0)) await rm(p, { recursive: true, force: true });
});
const sha = "a".repeat(64);
const source = {
  config: { path: "/private/config", sha256: sha },
  policy: { path: "/private/policy", sha256: sha },
  input: { path: "/private/input", sha256: sha },
};
const volume = {
  id: 702,
  series: "SOSH",
  number: 2,
  title: "DRAGON BALL総集編 超悟空伝 Legend2",
  isbn: "9784081111664",
};
function capture(): Capture {
  return {
    document: {
      canonical_url: "https://publisher.example/volume-2",
      source_domain: "publisher.example",
      http_status: 200,
      payload: {
        title_raw: volume.title,
        body_markdown: "ISBN 978-4-08-111166-4",
        embedded_media: [
          { url: "https://publisher.example/001.jpg", type: "image" },
          { url: "https://publisher.example/002.jpg", type: "image" },
        ],
      },
    },
    gallery: {
      expectedImages: 2,
      pages: [
        { url: "https://publisher.example/001.jpg", kind: "manga", printedPages: [1] },
        { url: "https://publisher.example/002.jpg", kind: "manga", printedPages: [2, 3] },
      ],
    },
  };
}
test("native gallery candidates preserve exact edition, order, spreads and pinned publication owner", () => {
  const result = acquisitionCandidate(capture(), [volume], source);
  expect(result.candidate?.series).toBe("SOSH");
  expect(result.candidate?.pages[1]?.printedPages).toEqual([2, 3]);
  expect(result.candidate?.source.isbnToken).toBe("978-4-08-111166-4");
  expect(result.candidate?.source.config).toEqual(source.config);
});
test("covers, missing identity, unobserved media and untyped DOM images stay quarantined", () => {
  const c = capture();
  for (const p of c.gallery!.pages! as { kind: string }[]) p.kind = "cover";
  expect(acquisitionCandidate(c, [volume], source).candidate).toBeUndefined();
  expect(
    acquisitionCandidate(capture(), [{ ...volume, isbn: "9784081111657" }], source).candidate,
  ).toBeUndefined();
  const unobserved = capture();
  unobserved.document.payload.embedded_media = [];
  expect(acquisitionCandidate(unobserved, [volume], source).candidate).toBeUndefined();
  const dom = capture();
  delete dom.gallery;
  expect(acquisitionCandidate(dom, [volume], source).candidate).toBeUndefined();
});
test("publisher spacing preserves literal evidence without mixing volume numbers or ISBNs", () => {
  const c = capture();
  const canon = {
    ...volume,
    title: "Dragon Ball English",
    titleJa: "DRAGON BALL 総集編 超悟空伝 Legend 2",
  };
  const result = acquisitionCandidate(c, [canon], source);
  expect(result.candidate?.source.editionToken).toBe(c.document.payload.title_raw);
  expect(result.candidate?.source.volumeToken).toBe(c.document.payload.title_raw);
  expect(
    acquisitionCandidate(c, [{ ...canon, titleJa: canon.titleJa.replace("2", "3") }], source)
      .candidate,
  ).toBeUndefined();
  expect(
    acquisitionCandidate(c, [{ ...canon, isbn: "9784081111671" }], source).candidate,
  ).toBeUndefined();
  c.document.payload.title_raw += "0";
  expect(acquisitionCandidate(c, [canon], source).candidate).toBeUndefined();
});
test("native HTML extraction removes executable and shell text, preserving Japanese text", async () => {
  const result = await textFromPoolHtml(
    "<html><head><script>danger()</script><style>secret</style></head><body><nav>navigation</nav><main>超悟空伝<img src='/page.jpg'>本文</main></body></html>",
  );
  expect(result.text).toContain("超悟空伝");
  expect(result.text).toContain("本文");
  expect(result.text).not.toContain("danger");
  expect(result.text).not.toContain("navigation");
  expect(result.images).toEqual(["/page.jpg"]);
});
test("provider-declared chapter pages reach acquisition candidates while generic gallery art remains untyped", async () => {
  const extracted =
    await textFromPoolHtml(`<html><title>${volume.title}</title><body>ISBN 978-4-08-111166-4
    <img src='/cover.jpg' alt='Cover'><img src='/1.jpg' data-page-number='1'>
    <img src='/2.jpg' alt='Chapter 25 Page 2'><img src='/logo.jpg' alt='Site logo'>
  </body></html>`);
  const c = capture();
  delete c.gallery;
  c.document.payload.body_markdown = extracted.text;
  c.document.payload.embedded_media = extracted.images.map((url) => ({
    url: new URL(url, c.document.canonical_url).href,
    type: "image",
  }));
  c.plates = extracted.plates.map((p) => ({
    url: new URL(p.url, c.document.canonical_url).href,
    kind: p.kind,
    printedPages: p.printedPages,
  }));
  const result = acquisitionCandidate(c, [volume], source);
  expect(result.candidate?.pages).toHaveLength(3);
  expect(result.candidate?.pages.filter((p) => p.kind === "manga")).toHaveLength(2);
  expect(result.candidate?.expectedImages).toBeNull();
  expect(result.candidate?.pages.map((p) => p.sourceUrl).join(" ")).not.toContain("logo");
  expect(result.candidate?.pages[2]?.printedPages).toBeNull();
});
test.skipIf(process.platform === "win32")(
  "pool receipts project incrementally into one private index, never publishing a landing page",
  async () => {
    const job = await mkdtemp(join(tmpdir(), "manga-pool-projection-"));
    temporary.push(job);
    await mkdir(join(job, "receipts"), { mode: 0o700 });
    const db = new Database(join(job, "frontier.sqlite"));
    db.exec(
      "CREATE TABLE pool_tasks(id TEXT,url TEXT,kind TEXT,series TEXT,volumeId INTEGER,receipt TEXT,state TEXT)",
    );
    const id = "c".repeat(64),
      path = join(job, "receipts", id + ".json"),
      body = "<html><title>超悟空伝</title><body>ISBN 9784081111664</body></html>";
    await Bun.write(
      path,
      JSON.stringify({
        state: "done",
        httpStatus: 200,
        contentType: "text/html",
        body,
        sha256: projectionDigest(body),
        finishedAt: new Date().toISOString(),
      }),
    );
    await chmod(path, 0o600);
    db.query("INSERT INTO pool_tasks VALUES(?,?,?,?,?,?,?)").run(
      id,
      "https://publisher.example/volume-2",
      "bibliography",
      "SOSH",
      702,
      path,
      "done",
    );
    db.close();
    let indexes = 0;
    const indexer = async () => {
      indexes++;
      return { indexed: 1 };
    };
    const first = await projectPoolReceipts(job, { indexer, minimumFreeBytes: 0 });
    const replay = await projectPoolReceipts(job, { indexer, minimumFreeBytes: 0 });
    expect(first.changed).toBe(1);
    expect(first.emitted).toBe(0);
    expect(first.quarantined).toBe(1);
    expect(replay.changed).toBe(0);
    expect(indexes).toBe(1);
    expect(replay.publicWrites).toBe(0);
  },
);
