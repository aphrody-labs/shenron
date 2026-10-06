/**
 * Admin-only downloads (`@/lib/private-downloads`): guard, index from SHA256SUMS, Range.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("server-only", () => ({}));

const TOKEN = "private-downloads-test-token-0123";
let dir = "";
const saved = { ...process.env };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "private-downloads-"));
  await writeFile(join(dir, "studio.exe"), "0123456789");
  await writeFile(join(dir, "unlisted.bin"), "secret");
  await writeFile(join(dir, "agy-train.md"), "# prompt");
  await writeFile(
    join(dir, "SHA256SUMS"),
    `${"a".repeat(64)}  studio.exe\n${"c".repeat(64)}  agy-train.md\n${"b".repeat(64)}  missing.exe\nnot a line\n`,
  );
  process.env.SHENRON_PRIVATE_DOWNLOADS_DIR = dir;
  process.env.SHENRON_ADMIN_TOKEN = TOKEN;
  process.env.SHENRON_ADMIN_IPS = "203.0.113.7";
  delete process.env.DATABOOKS_API_TOKEN;
});
afterAll(async () => {
  process.env = saved;
  await rm(dir, { recursive: true, force: true });
});

const lib = () => import("@/lib/private-downloads");
const req = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://dragonballfr.com${path}`, { headers });
const admin = { authorization: `Bearer ${TOKEN}` };

describe("private downloads", () => {
  test("anonymous callers get a 404 for the index and the files", async () => {
    const { listPrivateDownloads, servePrivateDownload } = await lib();
    expect((await listPrivateDownloads(req("/api/private-downloads"))).status).toBe(404);
    const file = await servePrivateDownload(req("/api/private-downloads/studio.exe"), "studio.exe");
    expect(file.status).toBe(404);
    const wrong = { authorization: "Bearer not-the-token-0123456789" };
    expect((await listPrivateDownloads(req("/api/private-downloads", wrong))).status).toBe(404);
  });

  test("the index lists the summed files that exist", async () => {
    const { listPrivateDownloads } = await lib();
    const res = await listPrivateDownloads(req("/api/private-downloads", admin));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      files: [
        {
          name: "agy-train.md",
          size: 8,
          sha256: "c".repeat(64),
          url: "https://dragonballfr.com/api/private-downloads/agy-train.md",
        },
        {
          name: "studio.exe",
          size: 10,
          sha256: "a".repeat(64),
          url: "https://dragonballfr.com/api/private-downloads/studio.exe",
        },
      ],
    });
  });

  test("an admin IP downloads the whole file; unlisted and traversal names are 404", async () => {
    const { servePrivateDownload } = await lib();
    const ip = { "x-real-ip": "203.0.113.7" };
    const res = await servePrivateDownload(req("/x", ip), "studio.exe");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-checksum-sha256")).toBe("a".repeat(64));
    expect(await res.text()).toBe("0123456789");
    expect((await servePrivateDownload(req("/x", ip), "unlisted.bin")).status).toBe(404);
    expect((await servePrivateDownload(req("/x", ip), "../etc/passwd")).status).toBe(404);
    expect((await servePrivateDownload(req("/x", ip), "SHA256SUMS")).status).toBe(404);
  });

  test("a prompt is served inline as Markdown, a binary as an attachment", async () => {
    const { servePrivateDownload } = await lib();
    const md = await servePrivateDownload(req("/x", admin), "agy-train.md");
    expect(md.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(md.headers.get("content-disposition")).toStartWith("inline");
    expect(await md.text()).toBe("# prompt");
    const exe = await servePrivateDownload(req("/x", admin), "studio.exe");
    expect(exe.headers.get("content-disposition")).toStartWith("attachment");
  });

  test("the ETag is the checksum and If-None-Match answers 304", async () => {
    const { servePrivateDownload } = await lib();
    const res = await servePrivateDownload(req("/x", admin), "studio.exe");
    const etag = res.headers.get("etag");
    expect(etag).toBe(`"${"a".repeat(32)}"`);
    const again = await servePrivateDownload(
      req("/x", { ...admin, "if-none-match": etag! }),
      "studio.exe",
    );
    expect(again.status).toBe(304);
    const anonymous = await servePrivateDownload(
      req("/x", { "if-none-match": etag! }),
      "studio.exe",
    );
    expect(anonymous.status).toBe(404);
  });

  test("Range resumes a download", async () => {
    const { servePrivateDownload, parseRange } = await lib();
    const res = await servePrivateDownload(
      req("/x", { ...admin, range: "bytes=4-" }),
      "studio.exe",
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 4-9/10");
    expect(await res.text()).toBe("456789");
    const bad = await servePrivateDownload(
      req("/x", { ...admin, range: "bytes=20-" }),
      "studio.exe",
    );
    expect(bad.status).toBe(416);
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("items=1-2", 10)).toBe("invalid");
  });
});
