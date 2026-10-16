/**
 * Public releases (`@/lib/releases`): manifest validation, version order, OS detection, serving.
 */
import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("server-only", () => ({}));

let dir = "";
const saved = { ...process.env };
const HASH = "a".repeat(64);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "releases-"));
  process.env.SHENRON_RELEASES_DIR = dir;
  await writeFile(join(dir, "shenron-server-linux-x64"), "payload");
  await writeFile(join(dir, "SHA256SUMS"), `${HASH}  shenron-server-linux-x64\n`);
  await writeFile(
    join(dir, "latest.json"),
    JSON.stringify({
      version: "1.4.0",
      publishedAt: "2026-10-16T12:00:00.000Z",
      assets: [
        {
          name: "shenron-server-linux-x64",
          os: "linux",
          arch: "x64",
          kind: "server",
          size: 7,
          sha256: HASH,
        },
      ],
    }),
  );
});

afterAll(async () => {
  process.env = saved;
  await rm(dir, { recursive: true, force: true });
});

test("compareVersions orders releases and pre-releases", async () => {
  const { compareVersions } = await import("@/lib/releases");
  expect(compareVersions("1.3.0", "1.4.0")).toBe(-1);
  expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
  expect(compareVersions("1.4.0", "1.4.0")).toBe(0);
  expect(compareVersions("1.4.0-rc.1", "1.4.0")).toBe(-1);
});

test("parseManifest rejects malformed manifests", async () => {
  const { parseManifest } = await import("@/lib/releases");
  expect(parseManifest({ version: "x", publishedAt: "2026-01-01", assets: [] })).toBeNull();
  expect(
    parseManifest({ version: "1.0.0", publishedAt: "2026-01-01", assets: [{ name: "../x" }] }),
  ).toBeNull();
  expect(parseManifest({ version: "1.0.0", publishedAt: "2026-01-01", assets: [] })).not.toBeNull();
});

test("detectOs falls back to linux", async () => {
  const { detectOs } = await import("@/lib/releases");
  expect(detectOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
  expect(detectOs("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  expect(detectOs(null)).toBe("linux");
});

test("latestRelease and serveRelease read the published directory", async () => {
  const { latestRelease, serveRelease } = await import("@/lib/releases");
  expect((await latestRelease())?.version).toBe("1.4.0");
  const ok = await serveRelease(new Request("https://x/a"), "shenron-server-linux-x64");
  expect(ok.status).toBe(200);
  expect(await ok.text()).toBe("payload");
  expect(ok.headers.get("cache-control")).toContain("public");
  expect((await serveRelease(new Request("https://x/a"), "latest.json")).status).toBe(404);
});
