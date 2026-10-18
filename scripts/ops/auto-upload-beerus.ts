#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * auto-upload-beerus: polls official Dragon Ball Super: Beerus sources, completes episodes immediately
 * upon availability, and stages/publishes them without manual intervention.
 *
 *   bun scripts/ops/auto-upload-beerus.ts [--loop] [--interval 300] [--apply]
 *
 * Operations per run:
 *   1. Synchronizes announced episode metadata and air dates (Wikipedia & dragonball-super.com).
 *   2. Checks upstream media streams/availability for announced episodes (e.g. ep 876).
 *   3. If a video stream or first-party file is newly resolved, runs complete-episode.ts to ingest
 *      Bun Video metadata, extract PNG frames, convert embedded WebVTT subtitles, and publish to CDN.
 *   4. Logs status and outputs JSON report.
 */

import { join } from "node:path";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const loop = process.argv.includes("--loop");
const apply = process.argv.includes("--apply");
const intervalSec = Number(arg("interval", "300"));
const SITE = process.env.SHENRON_SITE_URL ?? "https://dragonballfr.com";
const ua = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/155 Safari/537.36 Shenron/1.0",
};

async function runStep(
  label: string,
  cmd: string[],
): Promise<{ success: boolean; output: string }> {
  console.log(`[auto-upload] starting: ${label}`);
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  const code = await p.exited;
  const output = (stdout + "\n" + stderr).trim();
  if (code !== 0) {
    console.error(`[auto-upload] ERROR in ${label} (exit ${code}):\n${output}`);
    return { success: false, output };
  }
  console.log(`[auto-upload] completed: ${label}`);
  return { success: true, output };
}

async function cycle(): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`\n=== [auto-upload] cycle started at ${timestamp} ===`);

  // 1. Sync metadata from Wikipedia & dragonball-super.com
  const syncArgs = ["bun", join(import.meta.dir, "beerus-sync.ts")];
  if (apply) syncArgs.push("--apply");
  await runStep("beerus-sync", syncArgs);

  // 2. Query announced episodes in series (e.g. 875, 876, and upcoming)
  try {
    const listRes = await fetch(`${SITE}/api/episodes?series=DBS_BEERUS&limit=50`, { headers: ua });
    const episodesToCheck: number[] = [];
    if (listRes.ok) {
      const data = (await listRes.json()) as {
        episodes?: Array<{ id: number; framesCount?: number }>;
      };
      for (const ep of data.episodes ?? []) {
        if ((ep.framesCount ?? 0) < 20) episodesToCheck.push(ep.id);
      }
    }
    if (!episodesToCheck.includes(876)) episodesToCheck.push(876);

    for (const epId of episodesToCheck) {
      const res = await fetch(`${SITE}/api/episodes/${epId}`, { headers: ua });
      if (!res.ok) continue;
      const ep = (await res.json()) as Record<string, any>;
      console.log(
        `[auto-upload] Episode ${epId} state: title="${ep.title}", airDate=${ep.airDate}, hasCrunchyroll=${Boolean(ep.availability?.length)}, frames=${ep.framesCount}`,
      );

      // If video endpoint responds 200 and frames are missing, run complete-episode
      const videoHead = await fetch(`${SITE}/api/episodes/${epId}/video`, {
        method: "HEAD",
        headers: ua,
      }).catch(() => null);

      if (videoHead && videoHead.status === 200 && (ep.framesCount ?? 0) < 20) {
        console.log(
          `[auto-upload] Episode ${epId} video is ready! Ingesting with complete-episode.ts...`,
        );
        const completeArgs = [
          "bun",
          join(import.meta.dir, "complete-episode.ts"),
          "--id",
          String(epId),
          "--arc-id",
          "18",
        ];
        if (apply) completeArgs.push("--apply");
        await runStep(`complete-episode-${epId}`, completeArgs);
      }
    }
  } catch (err) {
    console.warn(`[auto-upload] Notice: unable to fetch episodes API:`, err);
  }

  console.log(`=== [auto-upload] cycle finished at ${new Date().toISOString()} ===\n`);
}

if (import.meta.main) {
  if (!loop) {
    await cycle();
  } else {
    console.log(`[auto-upload] Running daemon loop with interval ${intervalSec}s...`);
    while (true) {
      await cycle();
      await Bun.sleep(intervalSec * 1000);
    }
  }
}
