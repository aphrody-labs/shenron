// SPDX-License-Identifier: Apache-2.0
/**
 * Reproducible DBS_BEERUS episode ingestion, media extraction, R2 shard planning, and CLI workflow.
 * Supports canonical episodes 1-5 (875..879) and future episodes (880+).
 */
import {
  DEFAULT_GIF_PREVIEW,
  HERO_FRAME_TIMECODES,
  PINNED_YT_DLP_VERSION,
  buildYtDlpArgs,
  computeBeerusFrameTimecodes,
} from "../../packages/media/src/video-download";
import {
  IMMUTABLE_CACHE_CONTROL,
  buildManifestShards,
  buildRcloneR2Args,
  buildRsyncMeshArgs,
  r2ObjectKey,
  r2ShardId,
} from "../../packages/media/src/r2-sync";
import { crunchyrollWatchUrl } from "../../packages/media/src/crunchyroll-mapping";

export interface BeerusEpisodeSpec {
  id: number;
  series: "DBS_BEERUS";
  numberInSeries: number;
  crunchyrollId: string;
  crunchyrollSlug: string;
  titles: {
    ja: string;
    romaji: string;
    fr: string;
    en: string;
  };
  airDate: string;
  officialStillPrefix: string;
  officialStills: readonly string[];
}

export const DBS_BEERUS_EPISODES: ReadonlyArray<BeerusEpisodeSpec> = [
  {
    id: 875,
    series: "DBS_BEERUS",
    numberInSeries: 1,
    crunchyrollId: "GE00389313JAJP",
    crunchyrollSlug: "the-god-who-destroys",
    titles: {
      ja: "破壊の神様",
      romaji: "Hakai no Kami-sama",
      fr: "Le dieu de la Destruction",
      en: "The God Who Destroys",
    },
    airDate: "2026-10-11",
    officialStillPrefix: "st01",
    officialStills: [
      "st01-01.jpg",
      "st01-02.jpg",
      "st01-03.jpg",
      "st01-04.jpg",
      "st01-05.jpg",
      "st01-06.jpg",
    ],
  },
  {
    id: 876,
    series: "DBS_BEERUS",
    numberInSeries: 2,
    crunchyrollId: "GE00389314JAJP",
    crunchyrollSlug: "the-god-of-destruction-heads-to-the-planet-of-the-kai",
    titles: {
      ja: "破壊神界王星へ",
      romaji: "Hakai-shin Kaiō-sei e",
      fr: "Le dieu de la Destruction se rend sur la planète de Kaïo",
      en: "The God of Destruction Heads to the Planet of the Kai",
    },
    airDate: "2026-10-18",
    officialStillPrefix: "st02",
    officialStills: [
      "st02-01.jpg",
      "st02-02.jpg",
      "st02-03.jpg",
      "st02-04.jpg",
      "st02-05.jpg",
      "st02-06.jpg",
    ],
  },
  {
    id: 877,
    series: "DBS_BEERUS",
    numberInSeries: 3,
    crunchyrollId: "GE00389315JAJP",
    crunchyrollSlug: "the-god-of-destruction-heads-to-earth",
    titles: {
      ja: "破壊神地球へ",
      romaji: "Hakaishin Chikyū e",
      fr: "Le dieu de la Destruction se dirige vers la Terre",
      en: "The God of Destruction Heads to Earth",
    },
    airDate: "2026-10-25",
    officialStillPrefix: "st03",
    officialStills: [
      "st03-01.jpg",
      "st03-02.jpg",
      "st03-03.jpg",
      "st03-04.jpg",
      "st03-05.jpg",
      "st03-06.jpg",
    ],
  },
  {
    id: 878,
    series: "DBS_BEERUS",
    numberInSeries: 4,
    crunchyrollId: "GE00389316JAJP",
    crunchyrollSlug: "the-god-of-saiyans",
    titles: {
      ja: "サイヤ人の神",
      romaji: "Saiya-jin no Kami",
      fr: "Le dieu des Saiyans",
      en: "The God of Saiyans",
    },
    airDate: "2026-11-01",
    officialStillPrefix: "st04",
    officialStills: [
      "st04-01.jpg",
      "st04-02.jpg",
      "st04-03.jpg",
      "st04-04.jpg",
      "st04-05.jpg",
      "st04-06.jpg",
    ],
  },
  {
    id: 879,
    series: "DBS_BEERUS",
    numberInSeries: 5,
    crunchyrollId: "GE00389317JAJP",
    crunchyrollSlug: "the-god-of-destruction-and-son-goku",
    titles: {
      ja: "破壊神と孫悟空",
      romaji: "Hakai-shin to Son Gokū",
      fr: "Le dieu de la Destruction et Son Goku",
      en: "The God of Destruction and Son Goku",
    },
    airDate: "2026-11-08",
    officialStillPrefix: "st05",
    officialStills: [
      "st05-01.jpg",
      "st05-02.jpg",
      "st05-03.jpg",
      "st05-04.jpg",
      "st05-05.jpg",
      "st05-06.jpg",
    ],
  },
] as const;

export interface WorkflowCliOptions {
  episode?: number;
  id?: number;
  sourceUrl?: string;
  crunchyrollUrl?: string;
  cookiesFile?: string;
  sha256?: string;
  durationSec?: number;
  dryRun: boolean;
  plan: boolean;
}

export function parseWorkflowCliArgs(argv: readonly string[]): WorkflowCliOptions {
  const options: WorkflowCliOptions = {
    dryRun: false,
    plan: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--plan") {
      options.plan = true;
    } else if (arg === "--episode" && argv[i + 1]) {
      options.episode = Number.parseInt(argv[++i]!, 10);
    } else if (arg === "--id" && argv[i + 1]) {
      options.id = Number.parseInt(argv[++i]!, 10);
    } else if (arg === "--source-url" && argv[i + 1]) {
      options.sourceUrl = argv[++i]!;
    } else if (arg === "--crunchyroll-url" && argv[i + 1]) {
      options.crunchyrollUrl = argv[++i]!;
    } else if (arg === "--cookies" && argv[i + 1]) {
      options.cookiesFile = argv[++i]!;
    } else if (arg === "--sha256" && argv[i + 1]) {
      options.sha256 = argv[++i]!;
    } else if (arg === "--duration" && argv[i + 1]) {
      options.durationSec = Number.parseFloat(argv[++i]!);
    }
  }

  return options;
}

export function resolveBeerusEpisodeSpec(options: WorkflowCliOptions): BeerusEpisodeSpec {
  if (options.id !== undefined) {
    const byId = DBS_BEERUS_EPISODES.find((ep) => ep.id === options.id);
    if (byId) return byId;
  }
  if (options.episode !== undefined) {
    const byNum = DBS_BEERUS_EPISODES.find((ep) => ep.numberInSeries === options.episode);
    if (byNum) return byNum;
  }

  // Dynamic fallback for future episodes (e.g. episode 6 -> id 880)
  const numberInSeries = options.episode ?? (options.id ? options.id - 874 : 1);
  const id = options.id ?? 874 + numberInSeries;
  const padded = String(numberInSeries).padStart(2, "0");
  const crunchyrollId = `GE003893${12 + numberInSeries}JAJP`;

  return {
    id,
    series: "DBS_BEERUS",
    numberInSeries,
    crunchyrollId,
    crunchyrollSlug: `episode-${numberInSeries}`,
    titles: {
      ja: `ドラゴンボール超 ビルス編 第${numberInSeries}話`,
      romaji: `Dragon Ball Super Beerus-hen Episode ${numberInSeries}`,
      fr: `Dragon Ball Super : Beerus - Episode ${numberInSeries}`,
      en: `Dragon Ball Super: Beerus - Episode ${numberInSeries}`,
    },
    airDate: "2026-11-08",
    officialStillPrefix: `st${padded}`,
    officialStills: [
      `st${padded}_01.webp`,
      `st${padded}_02.webp`,
      `st${padded}_03.webp`,
      `st${padded}_04.webp`,
    ],
  };
}

export function buildBeerusEpisodeWorkflowPlan(options: WorkflowCliOptions) {
  const spec = resolveBeerusEpisodeSpec(options);
  const canonicalWatchUrl =
    options.crunchyrollUrl ?? crunchyrollWatchUrl(spec.crunchyrollId, spec.crunchyrollSlug, "fr");
  const downloadTargetUrl = options.sourceUrl ?? canonicalWatchUrl;
  const placeholderSha = (
    options.sha256 ?? `${String(spec.id).padStart(4, "0")}${"0".repeat(60)}`
  ).slice(0, 64);
  const durationSec = options.durationSec ?? 1420;

  const stagingDir = `/srv/shenron/staging/dbs-beerus/${spec.id}`;
  const ytDlpArgs = buildYtDlpArgs({
    url: downloadTargetUrl,
    outputTemplate: `${stagingDir}/source.%(ext)s`,
    cookiesFile: options.cookiesFile,
    concurrentFragments: 8,
    writeSubs: true,
    subLangs: ["ja", "fr-FR"],
  });

  const sceneFrameTimecodes = computeBeerusFrameTimecodes(durationSec, 41, 48.579, 32.5);
  const cdnSourcePath = `/media/episodes/${spec.id}/${placeholderSha}/source.mp4`;
  const cdnSubJaPath = `/assets/subtitles/dbs-beerus/${spec.id}.ja.vtt`;
  const cdnSubFrPath = `/assets/subtitles/dbs-beerus/${spec.id}.fr.vtt`;

  const shardPlan = buildManifestShards([
    {
      path: cdnSourcePath,
      sha256: placeholderSha,
      bytes: 420_000_000,
      contentType: "video/mp4",
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    },
  ]);

  return {
    pinnedYtDlpVersion: PINNED_YT_DLP_VERSION,
    episode: spec,
    urls: {
      crunchyrollWatchUrl: canonicalWatchUrl,
      downloadTargetUrl,
      cdnSourceUrl: `https://cdn.dragonballfr.com${cdnSourcePath}`,
      subtitles: {
        ja: `https://cdn.dragonballfr.com${cdnSubJaPath}`,
        fr: `https://cdn.dragonballfr.com${cdnSubFrPath}`,
      },
    },
    extraction: {
      sceneFrameCount: sceneFrameTimecodes.length,
      sceneFrameTimecodes,
      heroFrameTimecodes: HERO_FRAME_TIMECODES,
      gifPreview: DEFAULT_GIF_PREVIEW,
    },
    r2: {
      objectKey: r2ObjectKey(placeholderSha),
      sourceShardId: r2ShardId(cdnSourcePath),
      manifestShardsCount: shardPlan.size,
      rcloneArgs: buildRcloneR2Args({
        source: `${stagingDir}/_objects`,
        bucket: "shenron-cdn/_objects",
      }),
      rsyncMeshArgs: buildRsyncMeshArgs({
        source: `${stagingDir}/`,
        destination: `cdn:/srv/shenron/r2-mirror/dbs-beerus/${spec.id}/`,
      }),
    },
    commands: {
      ytDlp: ["yt-dlp", ...ytDlpArgs].join(" "),
    },
  };
}

if (import.meta.main) {
  const cliOptions = parseWorkflowCliArgs(Bun.argv.slice(2));
  const plan = buildBeerusEpisodeWorkflowPlan(cliOptions);
  console.log(JSON.stringify(plan, null, 2));
}
