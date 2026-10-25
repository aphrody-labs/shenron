// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

const paths: string[] = [];
const watchUrl =
  "https://www.crunchyroll.com/fr/watch/GE00389315JAJP/the-god-of-destruction-heads-to-earth";
const html = `<html lang="fr"><head><link rel="canonical" href="${watchUrl}"><script type="application/ld+json">${JSON.stringify(
  [
    {
      "@type": "TVEpisode",
      url: watchUrl,
      episodeNumber: 3,
      name: "Episode three",
      partOfSeries: {
        "@id": "https://www.crunchyroll.com/fr/series/GT00389311/dragon-ball-super-beerus",
      },
    },
    { "@type": "VideoObject", name: "Episode three", duration: "PT23M17S" },
  ],
)}</script></head></html>`;

async function runResolution(params: Record<string, unknown>, tampered = false) {
  const directory = resolve(
    import.meta.dir,
    "../../../var/reports/crunchyroll-service-tests",
    crypto.randomUUID(),
  );
  paths.push(directory);
  const backend = join(directory, "backend.json");
  await Bun.write(
    backend,
    JSON.stringify({
      html: {
        text: html,
        sha256: tampered ? "invalid" : new Bun.CryptoHasher("sha256").update(html).digest("hex"),
      },
    }),
  );
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
    import { CrunchyrollService } from "./packages/crunchyroll/src/service";
    try { console.log(JSON.stringify({ url: await new CrunchyrollService().resolveWatchUrl(JSON.parse(Bun.argv[1])) })); }
    catch(error) { console.log(JSON.stringify({ error: error instanceof Error ? error.message : "failed" })); }
  `,
      JSON.stringify(params),
    ],
    {
      cwd: resolve(import.meta.dir, "../../.."),
      env: { ...process.env, CRUNCHYROLL_BACKEND_ARCHIVE: backend },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit).toBe(0);
  expect(stderr).toBe("");
  return JSON.parse(stdout) as { url?: string | null; error?: string };
}

afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { force: true, recursive: true });
});

describe("Crunchyroll imported watch URL resolver", () => {
  test("resolves E3 by exact series and episode number without asserting playback", async () => {
    expect(await runResolution({ series: "DBS_BEERUS", number: 3 })).toEqual({ url: watchUrl });
    expect(await runResolution({ episodeId: "GE00389315JAJP" })).toEqual({ url: watchUrl });
  });
  test("does not cross series or invent missing episode links", async () => {
    for (const params of [
      { series: "DB_DAIMA", number: 3 },
      { series: "UNKNOWN", number: 3 },
      { series: "DBS_BEERUS", number: 2 },
      { series: "DBS_BEERUS", number: 3.5 },
    ])
      expect(await runResolution(params)).toEqual({ url: null });
  });
  test("rejects modified backend HTML instead of resolving unverified content", async () => {
    expect(await runResolution({ series: "DBS_BEERUS", number: 3 }, true)).toEqual({
      error: "Cannot read validated Crunchyroll catalogue",
    });
  });
});
