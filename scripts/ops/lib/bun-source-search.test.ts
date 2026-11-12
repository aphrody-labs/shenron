import { expect, test } from "bun:test";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectSourceSearch,
  planSourceSearch,
  type SourceSearchConfig,
} from "./bun-source-search";
test.skipIf(process.platform === "win32")(
  "explicit discovery pins query scope, keeps jar out of argv and resumes without request",
  async () => {
    const job = await mkdtemp(join(tmpdir(), "shenron-search-"));
    try {
      const jar = join(job, "jar.json");
      await Bun.write(jar, "{}");
      await chmod(jar, 0o600);
      const config: SourceSearchConfig = {
        queries: ["Toriyama interview"],
        domains: ["dragon-ball-official.com"],
        count: 2,
        cookieJar: jar,
      };
      let requests = 0;
      const result = await collectSourceSearch(
        config,
        job,
        undefined,
        async (args, cookie, signal) => {
          requests++;
          expect(args).not.toContain(jar);
          expect(cookie).toBe(jar);
          expect(signal.aborted).toBe(false);
          return JSON.stringify({
            query: args.at(-1),
            authenticated: true,
            transport: "fetch",
            servedFromCache: false,
            organic: [
              {
                position: 1,
                title: "Interview",
                url: "https://dragon-ball-official.com/news/1",
                snippet: "Reference",
              },
            ],
          });
        },
      );
      expect(result.resumed).toBe(false);
      expect(result.inputSha256).toBe(planSourceSearch(config).sha256);
      const replay = await collectSourceSearch(config, job, undefined, async () => {
        throw Error("unexpected request");
      });
      expect(replay.resumed).toBe(true);
      expect(replay.receiptSha256).toBe(result.receiptSha256);
      expect(requests).toBe(1);
    } finally {
      await rm(job, { recursive: true, force: true });
    }
  },
);
test.skipIf(process.platform === "win32")(
  "unscoped query injection and denied result fail before a successful receipt",
  async () => {
    const job = await mkdtemp(join(tmpdir(), "shenron-search-"));
    try {
      const jar = join(job, "jar.json");
      await Bun.write(jar, "{}");
      await chmod(jar, 0o600);
      const config: SourceSearchConfig = {
        queries: ["interview"],
        domains: ["google.com"],
        count: 1,
        cookieJar: jar,
      };
      expect(() => planSourceSearch({ ...config, queries: ["interview site:other.com"] })).toThrow(
        "queries",
      );
      await expect(
        collectSourceSearch(config, job, undefined, async (args) =>
          JSON.stringify({
            query: args.at(-1),
            authenticated: true,
            transport: "fetch",
            servedFromCache: false,
            organic: [{ position: 1, title: "x", url: "https://other.com/", snippet: "x" }],
          }),
        ),
      ).rejects.toThrow("scope");
      await chmod(jar, 0o644);
      await expect(collectSourceSearch(config, job)).rejects.toThrow("private cookie jar");
    } finally {
      await rm(job, { recursive: true, force: true });
    }
  },
);
test.skipIf(process.platform === "win32")(
  "cancelled and oversized discovery never writes a successful receipt",
  async () => {
    const job = await mkdtemp(join(tmpdir(), "shenron-search-"));
    try {
      const jar = join(job, "jar.json");
      await Bun.write(jar, "{}");
      await chmod(jar, 0o600);
      const config: SourceSearchConfig = {
        queries: ["interview"],
        domains: ["google.com"],
        count: 1,
        cookieJar: jar,
      };
      const controller = new AbortController();
      controller.abort();
      let calls = 0;
      await expect(
        collectSourceSearch(config, job, controller.signal, async () => {
          calls++;
          return "{}";
        }),
      ).rejects.toThrow();
      expect(calls).toBe(0);
      await expect(
        collectSourceSearch(config, job, undefined, async () => "x".repeat(256 * 1024 + 1)),
      ).rejects.toThrow("output limit");
      expect(
        await Bun.file(
          join(job, "discovery-" + planSourceSearch(config).sha256 + ".json"),
        ).exists(),
      ).toBe(false);
    } finally {
      await rm(job, { recursive: true, force: true });
    }
  },
);
test("native search dispatch enables runtime mode for a compiled product executable", async () => {
  const { spyOn } = await import("bun:test");
  const { nativeSearch } = await import("./bun-source-search");
  const spawn = spyOn(Bun, "spawn").mockImplementation(() => {
    throw Error("fixture spawn intercepted");
  });
  try {
    await expect(
      nativeSearch(
        ["--json", "--", "fixture"],
        "/private/jar.json",
        new AbortController().signal,
        1024,
      ),
    ).rejects.toThrow("intercepted");
    expect(spawn).toHaveBeenCalledWith(
      [process.execPath, "search", "--json", "--", "fixture"],
      expect.objectContaining({
        env: expect.objectContaining({
          BUN_BE_BUN: "1",
          APHRODY_GOOGLE_COOKIES_JSON: "/private/jar.json",
        }),
      }),
    );
  } finally {
    spawn.mockRestore();
  }
});
