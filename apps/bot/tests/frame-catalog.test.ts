import "./setup"; // must be first
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { analyzeBytes, analyzePixels, ANALYSIS_WIDTH } from "~/frames/analyze";
import {
  buildCatalog,
  DEFAULT_LISTS,
  type AnalysedFrame,
  type EpisodeInfo,
} from "~/frames/catalog-build";
import {
  dayKey,
  defaultCatalog,
  pickFrameBackdrop,
  RACE_SAGAS,
  type FrameCatalog,
} from "~/frames/catalog";
import {
  auraShare,
  TRANSFORMATION_KEYS,
  transformationKeyForLabel,
  transformationsOfTitles,
} from "~/frames/transformations";
import { canvasNativeOk } from "./render-helpers";

const d = canvasNativeOk ? describe : describe.skip;

// ─── Synthetic frames ────────────────────────────────────────────────────────────────────────

type Draw = (
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  w: number,
  h: number,
) => void;

/** PNG bytes of a 320 x 240 frame (the real ones are 640 x 480, 4:3). */
async function framePng(draw: Draw, w = 320, h = 240): Promise<Uint8Array> {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  draw(ctx, w, h);
  return new Uint8Array(await canvas.encode("png"));
}

/** Sky, ground and a coloured character with an ink outline at `(cx, cy)`. */
const scene =
  (cx: number, cy: number): Draw =>
  (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#58a8e8");
    sky.addColorStop(1, "#c8e8f8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#4a9a3c";
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    // the character: orange body, yellow hair, black outline
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#101010";
    ctx.fillStyle = "#f07818";
    ctx.beginPath();
    ctx.rect(cx - 36, cy - 10, 72, 96);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f8d070";
    ctx.beginPath();
    ctx.moveTo(cx - 40, cy - 10);
    ctx.lineTo(cx - 20, cy - 70);
    ctx.lineTo(cx, cy - 30);
    ctx.lineTo(cx + 24, cy - 76);
    ctx.lineTo(cx + 40, cy - 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

/** White lettering on black: two lines of 12 letters, like a title card. */
const titleCard: Draw = (ctx, w, h) => {
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  for (const y of [90, 130]) {
    for (let i = 0; i < 12; i++) ctx.fillRect(40 + i * 20, y, 11, 22);
  }
};

describe("transformation links (episode titles)", () => {
  test("a title that names the transformation links the episode", () => {
    expect(transformationsOfTitles({ ja: "ついに変身!! 伝説の超サイヤ人･孫悟空" })).toEqual([
      "ssj",
    ]);
    expect(transformationsOfTitles({ ja: "アッと驚く大変身!! 超サイヤ人3" })).toEqual(["ssj3"]);
    expect(transformationsOfTitles({ ja: "最強!!悟空が超サイヤ人4に!!" })).toEqual(["ssj4"]);
    expect(
      transformationsOfTitles({ ja: "お待たせ、ビルス様 ついに超サイヤ人ゴッド誕生！" }),
    ).toEqual(["ssg"]);
    expect(transformationsOfTitles({ ja: "悟空VSケフラ！超サイヤ人ブルー敗れる！？" })).toEqual([
      "ssb",
    ]);
    expect(transformationsOfTitles({ ja: "再戦ゴクウブラック！ 超サイヤ人ロゼ登場！！" })).toEqual([
      "rose",
    ]);
    expect(transformationsOfTitles({ fr: "Goku, le Super Saïyen 2 !" })).toEqual(["ssj2"]);
  });

  test("a title that merely mentions the form does not", () => {
    expect(transformationsOfTitles({ ja: "悟空闘いへの目覚め!超サイヤ人を超えろ!!" })).toEqual([]);
    expect(transformationsOfTitles({ ja: "ベジータ強し!! 目覚める超サイヤ人の血" })).toEqual([]);
    expect(transformationsOfTitles({ ja: "ブルマと孫悟空", fr: "Le Grand Départ" })).toEqual([]);
  });

  test("tier labels of the three languages map to the transformation", () => {
    expect(transformationKeyForLabel("Super Saiyan")).toBe("ssj");
    expect(transformationKeyForLabel("Super Saiyan 2")).toBe("ssj2");
    expect(transformationKeyForLabel("超サイヤ人3")).toBe("ssj3");
    expect(transformationKeyForLabel("Super Saiyan God")).toBe("ssg");
    expect(transformationKeyForLabel("Super Saiyan Blue Kaioken")).toBe("ssb");
    expect(transformationKeyForLabel("Mastered Ultra Instinct")).toBe("ui");
    expect(transformationKeyForLabel("Super Ozaru")).toBe("ozaru");
    expect(transformationKeyForLabel("Zenkaï")).toBeNull();
    expect(transformationKeyForLabel(null)).toBeNull();
  });

  test("the colour of an aura is found in the hue sectors of a frame", () => {
    const golden = [0, 0, 0.12, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 60-90 degrees
    const sky = [0, 0, 0, 0, 0, 0, 0.2, 0, 0, 0, 0, 0];
    expect(auraShare("ssj", golden)).toBeGreaterThan(0.1);
    expect(auraShare("ssj", sky)).toBe(0);
    expect(auraShare("ssb", sky)).toBeGreaterThan(0.1);
    expect(auraShare("ui", golden)).toBe(0);
  });
});

d("frame analysis", () => {
  test("a black frame, a white frame and a flat fade are recognised and score nothing", async () => {
    const black = await analyzeBytes(
      await framePng((ctx, w, h) => {
        ctx.fillStyle = "#020202";
        ctx.fillRect(0, 0, w, h);
      }),
    );
    const white = await analyzeBytes(
      await framePng((ctx, w, h) => {
        ctx.fillStyle = "#fdfdfd";
        ctx.fillRect(0, 0, w, h);
      }),
    );
    const fade = await analyzeBytes(
      await framePng((ctx, w, h) => {
        ctx.fillStyle = "#5a7088";
        ctx.fillRect(0, 0, w, h);
      }),
    );
    expect(black.flags).toContain("black");
    expect(white.flags).toContain("white");
    expect(fade.flags).toContain("transition");
    for (const flat of [black, white, fade]) expect(flat.score).toBeLessThan(0.08);
    expect(black.luma).toBeLessThan(0.05);
    expect(white.luma).toBeGreaterThan(0.95);
  });

  test("a title card is text, and credits when it sits on a dark ground", async () => {
    const card = await analyzeBytes(await framePng(titleCard));
    expect(card.flags).toContain("text");
    expect(card.flags).toContain("credits");
    expect(card.score).toBeLessThan(0.3);
    // the same lettering on a lit frame is text but not credits, unless at the end of the episode
    const lit = await framePng((ctx, w, h) => {
      scene(160, 150)(ctx, w, h);
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 12; i++) ctx.fillRect(40 + i * 20, 20, 11, 22);
    });
    const caption = await analyzeBytes(lit);
    expect(caption.flags).toContain("text");
    expect(caption.flags).not.toContain("credits");
    expect((await analyzeBytes(lit, { nearEnd: true })).flags).toContain("credits");
  });

  test("a lively scene is usable: contrast, saturation, sharpness, no flag", async () => {
    const result = await analyzeBytes(await framePng(scene(160, 130)));
    expect(result.flags).toEqual([]);
    expect(result.contrast).toBeGreaterThan(0.1);
    expect(result.saturation).toBeGreaterThan(0.4);
    expect(result.sharpness).toBeGreaterThan(50);
    expect(result.score).toBeGreaterThan(0.4);
    expect(result.dominant).toMatch(/^#[0-9a-f]{6}$/);
    expect(result.hueShares).toHaveLength(12);
    // the sky is blue, the character orange and yellow
    expect(result.hueShares.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.3);
  });

  test("the focus and the 2:1 and 1:1 windows follow the subject", async () => {
    const low = await analyzeBytes(await framePng(scene(250, 170)));
    const left = await analyzeBytes(await framePng(scene(70, 130)));
    // a 4:3 frame: the 2:1 window is full width and 2/3 of the height, the 1:1 window 3/4 wide
    expect(low.crop21.w).toBe(1);
    expect(low.crop21.h).toBeCloseTo(2 / 3, 2);
    expect(low.crop11.h).toBe(1);
    expect(low.crop11.w).toBeCloseTo(0.75, 2);
    expect(low.focus[0]).toBeGreaterThan(0.55);
    expect(left.focus[0]).toBeLessThan(0.45);
    expect(low.crop11.x).toBeGreaterThan(left.crop11.x);
    expect(low.crop21.y).toBeGreaterThanOrEqual(left.crop21.y);
    // the window holds more than its share of the saliency
    expect(low.crop11.held).toBeGreaterThan(0.75);
    for (const crop of [low.crop21, low.crop11]) {
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.w).toBeLessThanOrEqual(1.0001);
      expect(crop.y + crop.h).toBeLessThanOrEqual(1.0001);
    }
  });

  test("the analysis is deterministic and does not depend on the source size", async () => {
    const bytes = await framePng(scene(190, 140), 640, 480);
    const a = await analyzeBytes(bytes);
    const b = await analyzeBytes(bytes);
    expect(b).toEqual(a);
    expect(a.sourceWidth).toBe(640);
    // analysed at a fixed width whatever the source
    const small = await analyzeBytes(await framePng(scene(95, 70), 320, 240));
    expect(small.score).toBeGreaterThan(0.4);
    expect(Math.abs(small.focus[0] - a.focus[0])).toBeLessThan(0.1);
    expect(ANALYSIS_WIDTH).toBe(256);
  });

  test("raw pixels give the same numbers as the encoded frame", async () => {
    const canvas = createCanvas(256, 192);
    const ctx = canvas.getContext("2d");
    scene(128, 100)(ctx, 256, 192);
    const raw = analyzePixels({
      width: 256,
      height: 192,
      data: ctx.getImageData(0, 0, 256, 192).data,
    });
    const encoded = await analyzeBytes(new Uint8Array(await canvas.encode("png")));
    expect(raw.flags).toEqual(encoded.flags);
    expect(raw.score).toBeCloseTo(encoded.score, 2);
  });
});

// ─── Catalog assembly ────────────────────────────────────────────────────────────────────────

function episode(id: number, series: string, extra: Partial<EpisodeInfo> = {}): EpisodeInfo {
  return {
    id,
    series,
    number: id,
    titleJa: null,
    titleFr: null,
    durationSec: 1440,
    arc: null,
    saga: null,
    ...extra,
  };
}

function analysed(
  ep: EpisodeInfo,
  index: number,
  score: number,
  flags: AnalysedFrame["analysis"]["flags"] = [],
): AnalysedFrame {
  const path = `${ep.series}/ep${String(ep.number).padStart(3, "0")}/frame-${String(index).padStart(5, "0")}.webp`;
  return {
    episode: ep,
    path,
    timecodeSec: index * 160,
    analysis: {
      luma: 0.4,
      contrast: 0.2,
      range: 0.7,
      sharpness: 300,
      saturation: 0.5,
      colorfulness: 60,
      hue: 35,
      dominant: "#c8a064",
      hueShares: [0.1, 0.1, 0.05, 0, 0, 0, 0.2, 0.1, 0, 0, 0, 0.05],
      text: 0,
      dark: 0.1,
      flags,
      focus: [0.5, 0.4],
      crop21: { x: 0, y: 0.1, w: 1, h: 0.667, held: 0.7 },
      crop11: { x: 0.1, y: 0, w: 0.75, h: 1, held: 0.8 },
      score,
    },
  };
}

function sample(): AnalysedFrame[] {
  const frames: AnalysedFrame[] = [];
  for (let e = 1; e <= 30; e++) {
    const ep = episode(e, e <= 15 ? "DB" : "DBZ", {
      saga: e % 2 ? "saga-a" : "saga-b",
      arc: e % 3 ? `arc-${e % 4}` : null,
      titleJa: e === 20 ? "ついに変身!! 伝説の超サイヤ人･孫悟空" : null,
    });
    for (let i = 1; i <= 8; i++) {
      // deterministic spread of scores, some flagged, some below the floor
      const score = ((e * 37 + i * 91) % 100) / 100;
      const flags = i === 8 ? (["text"] as const) : [];
      frames.push(analysed(ep, i, score, [...flags]));
    }
  }
  return frames;
}

describe("catalog assembly", () => {
  const options = {
    base: "https://cdn.example/f/",
    totals: { episodes: 30, frames: 240, failed: 0 },
  };

  test("the catalog does not depend on the order the analyses arrive in", () => {
    const frames = sample();
    const shuffled = frames.toSorted(
      (a, b) =>
        ((a.path.length * 7919) % 13) - ((b.path.length * 7919) % 13) || (a.path < b.path ? 1 : -1),
    );
    expect(shuffled.map((f) => f.path)).not.toEqual(frames.map((f) => f.path));
    expect(JSON.stringify(buildCatalog(shuffled, options))).toBe(
      JSON.stringify(buildCatalog(frames, options)),
    );
  });

  test("lists are bounded, best first, with at most two frames of an episode", () => {
    const catalog = buildCatalog(sample(), { ...options, perSeries: 6, perSaga: 4, perArc: 3 });
    for (const lists of [catalog.series, catalog.sagas, catalog.arcs]) {
      for (const indexes of Object.values(lists)) {
        expect(indexes.length).toBeGreaterThan(0);
        const scores = indexes.map((i) => catalog.frames[i]!.q);
        expect(scores).toEqual(scores.toSorted((a, b) => b - a));
        const perEpisode = new Map<number, number>();
        for (const i of indexes) {
          const e = catalog.frames[i]!.e;
          perEpisode.set(e, (perEpisode.get(e) ?? 0) + 1);
        }
        expect(Math.max(...perEpisode.values())).toBeLessThanOrEqual(DEFAULT_LISTS.perEpisode);
      }
    }
    expect(catalog.series.DB!.length).toBe(6);
    expect(Math.max(...Object.values(catalog.sagas).map((l) => l.length))).toBeLessThanOrEqual(4);
    expect(Math.max(...Object.values(catalog.arcs).map((l) => l.length))).toBeLessThanOrEqual(3);
  });

  test("flagged and weak frames are counted but never offered", () => {
    const catalog = buildCatalog(sample(), options);
    expect(catalog.totals.analysed).toBe(240);
    expect(catalog.totals.flags.text).toBe(30);
    for (const frame of catalog.frames) {
      expect(frame.q).toBeGreaterThanOrEqual(DEFAULT_LISTS.minScore);
      expect(frame.p).not.toMatch(/frame-00008/); // the flagged one of every episode
    }
    expect(catalog.totals.usable).toBeLessThan(240 - 30);
  });

  test("the episodes whose title announces a transformation feed its list", () => {
    const catalog = buildCatalog(sample(), options);
    expect(Object.keys(catalog.transformations)).toEqual(["ssj"]);
    for (const index of catalog.transformations.ssj!) expect(catalog.frames[index]!.e).toBe(20);
    expect(catalog.transformations.ssj!.length).toBeGreaterThan(0);
  });

  test("entries are sorted by path and compact", () => {
    const catalog = buildCatalog(sample(), options);
    const paths = catalog.frames.map((frame) => frame.p);
    expect(paths).toEqual(paths.toSorted());
    expect(new Set(paths).size).toBe(paths.length);
    expect(JSON.stringify(catalog).length).toBeLessThan(60_000);
  });
});

// ─── The committed catalog ───────────────────────────────────────────────────────────────────

describe("committed catalog (assets/render/frame-catalog.json)", () => {
  const catalog = defaultCatalog;
  const lists = (): Array<[string, number[]]> => [
    ...Object.entries(catalog.series),
    ...Object.entries(catalog.sagas),
    ...Object.entries(catalog.arcs),
    ...Object.entries(catalog.transformations).map(([k, v]) => [k, v] as [string, number[]]),
  ];

  test("covers every series of the database, with the totals of the build", () => {
    expect(catalog.version).toBe(1);
    expect(catalog.base).toBe("https://cdn.dragonballfr.com/assets/ext/db_episodes_frames/");
    expect(Object.keys(catalog.series).toSorted()).toEqual([
      "DB",
      "DBGT",
      "DBS",
      "DBZ",
      "DBZ_KAI",
      "DBZ_KAI_FINAL",
      "DB_DAIMA",
    ]);
    expect(catalog.totals.frames).toBeGreaterThan(6000);
    expect(catalog.totals.analysed).toBeGreaterThan(catalog.totals.frames * 0.99);
    expect(catalog.totals.usable).toBeGreaterThan(catalog.totals.analysed * 0.8);
    for (const flag of ["black", "white", "transition", "text"]) {
      expect(catalog.totals.flags[flag], flag).toBeGreaterThan(0);
    }
    expect(Object.keys(catalog.sagas).length).toBeGreaterThan(8);
    expect(Object.keys(catalog.arcs).length).toBeGreaterThan(8);
  });

  test("every list points at entries, best first", () => {
    for (const [name, indexes] of lists()) {
      expect(indexes.length, name).toBeGreaterThan(0);
      for (const index of indexes) expect(catalog.frames[index], `${name} ${index}`).toBeDefined();
    }
    for (const [name, indexes] of Object.entries(catalog.series)) {
      const scores = indexes.map((i) => catalog.frames[i]!.q);
      expect(scores, name).toEqual(scores.toSorted((a, b) => b - a));
      expect(indexes.length, name).toBeLessThanOrEqual(DEFAULT_LISTS.perSeries);
    }
  });

  test("an entry is a usable backdrop with sane numbers", () => {
    const unit = (value: number) => value >= 0 && value <= 1.0001;
    for (const frame of catalog.frames) {
      expect(frame.p).toMatch(/^[A-Z_]+\/ep\d{3}\/frame-\d{5}\.webp$/);
      expect(frame.d).toMatch(/^#[0-9a-f]{6}$/);
      expect(frame.q).toBeGreaterThanOrEqual(DEFAULT_LISTS.minScore);
      expect(unit(frame.l) && unit(frame.k) && unit(frame.sa) && unit(frame.q)).toBe(true);
      expect(unit(frame.f[0]) && unit(frame.f[1])).toBe(true);
      for (const crop of [frame.c2, frame.c1]) {
        expect(crop.length).toBe(5);
        expect(crop.every(unit)).toBe(true);
        expect(crop[0]! + crop[2]!).toBeLessThanOrEqual(1.0001);
        expect(crop[1]! + crop[3]!).toBeLessThanOrEqual(1.0001);
      }
      // a window spans the frame in one direction (the frames are 4:3 or 16:9)
      expect(Math.max(frame.c2[2]!, frame.c2[3]!)).toBeGreaterThan(0.99);
      expect(Math.max(frame.c1[2]!, frame.c1[3]!)).toBeGreaterThan(0.99);
      expect(frame.c2[3]!).toBeLessThan(0.95); // never taller than a 2:1 window of a landscape frame
    }
  });

  test("the transformations that a title names have frames, from the right episodes", () => {
    for (const key of ["ssj", "ssj3", "ssj4", "ssg", "ssb", "rose", "kaioken", "ozaru", "ui"]) {
      expect(
        catalog.transformations[key as keyof typeof catalog.transformations],
        key,
      ).toBeDefined();
    }
    // Goku turns Super Saiyan in episode 95 of DBZ
    const ssj = catalog.transformations.ssj!.map((i) => catalog.frames[i]!);
    expect(ssj.every((frame) => frame.p.startsWith("DBZ/ep095/"))).toBe(true);
    const ssg = catalog.transformations.ssg!.map((i) => catalog.frames[i]!);
    expect(ssg.every((frame) => frame.p.startsWith("DBS/"))).toBe(true);
    expect(TRANSFORMATION_KEYS.length).toBeGreaterThan(8);
  });
});

// ─── Choice of a backdrop ────────────────────────────────────────────────────────────────────

describe("choice of a backdrop", () => {
  const catalog = defaultCatalog;
  const pathOf = (backdrop: ReturnType<typeof pickFrameBackdrop>) => backdrop?.id ?? "";
  const indexOf = (id: string) => catalog.frames.findIndex((frame) => frame.p === id);

  test("the same member gets the same frame, other members get others", () => {
    const request = { purpose: "profile" as const, seed: "member-1", day: "2026-10-23" };
    const first = pickFrameBackdrop(request);
    expect(first).not.toBeNull();
    expect(pickFrameBackdrop(request)).toEqual(first);
    expect(first!.url).toStartWith(catalog.base);
    expect(first!.focus).toHaveLength(2);
    const others = new Set(
      Array.from({ length: 40 }, (_, i) =>
        pathOf(pickFrameBackdrop({ ...request, seed: `member-${i}` })),
      ),
    );
    expect(others.size).toBeGreaterThan(10);
  });

  test("without race or tier the profile frame rotates every day, with them it does not", () => {
    const days = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const rotating = new Set(
      days.map((day) => pathOf(pickFrameBackdrop({ purpose: "profile", seed: "m", day }))),
    );
    expect(rotating.size).toBeGreaterThan(5);
    const steady = new Set(
      days.map((day) =>
        pathOf(pickFrameBackdrop({ purpose: "profile", seed: "m", day, race: "saiyan" })),
      ),
    );
    expect(steady.size).toBe(1);
  });

  test("a race shows its saga", () => {
    for (const [race, sagas] of Object.entries(RACE_SAGAS)) {
      const pool = new Set(sagas.flatMap((saga) => catalog.sagas[saga] ?? []));
      expect(pool.size, race).toBeGreaterThan(0);
      for (let i = 0; i < 20; i++) {
        const backdrop = pickFrameBackdrop({ purpose: "profile", seed: `m${i}`, race });
        expect(pool.has(indexOf(backdrop!.id)), `${race} ${backdrop!.id}`).toBe(true);
      }
    }
  });

  test("a tier shows an episode that names its transformation, else the series where it appears", () => {
    const linked = new Set(catalog.transformations.ssg!);
    for (let i = 0; i < 10; i++) {
      const backdrop = pickFrameBackdrop({
        purpose: "tier",
        seed: `m${i}`,
        label: "Super Saiyan God",
      });
      expect(linked.has(indexOf(backdrop!.id))).toBe(true);
    }
    const viaKey = pickFrameBackdrop({ purpose: "tier", seed: "m", transformation: "ssg" });
    expect(linked.has(indexOf(viaKey!.id))).toBe(true);
    // Super Saiyan 2 has no episode title naming it: a frame of DBZ or DBZ Kai instead
    expect(catalog.transformations.ssj2).toBeUndefined();
    const fallback = pickFrameBackdrop({ purpose: "tier", seed: "m", label: "Super Saiyan 2" });
    expect(["DBZ", "DBZ_KAI"]).toContain(fallback!.series);
    // a label that is no transformation falls back to the frame of the day
    const plain = pickFrameBackdrop({
      purpose: "tier",
      seed: "m",
      label: "Zenkaï",
      day: "2026-10-23",
    });
    expect(plain).not.toBeNull();
  });

  test("the leaderboard has one frame a day for the whole server", () => {
    const today = pickFrameBackdrop({
      purpose: "leaderboard",
      seed: "leaderboard",
      day: "2026-10-23",
    });
    const again = pickFrameBackdrop({
      purpose: "leaderboard",
      seed: "leaderboard",
      day: "2026-10-23",
    });
    expect(again).toEqual(today);
    const week = new Set(
      Array.from({ length: 14 }, (_, i) =>
        pathOf(
          pickFrameBackdrop({
            purpose: "leaderboard",
            seed: "leaderboard",
            day: `2026-11-${String(i + 1).padStart(2, "0")}`,
          }),
        ),
      ),
    );
    expect(week.size).toBeGreaterThan(8);
    expect(dayKey(new Date("2026-10-23T23:59:59Z"))).toBe("2026-10-23");
  });

  test("an empty catalog gives nothing, and the card draws its own background", () => {
    const empty: FrameCatalog = {
      ...catalog,
      frames: [],
      series: {},
      sagas: {},
      arcs: {},
      transformations: {},
    };
    for (const purpose of ["profile", "tier", "leaderboard"] as const) {
      expect(
        pickFrameBackdrop({ purpose, seed: "m", race: "saiyan", label: "Super Saiyan" }, empty),
      ).toBeNull();
    }
  });
});

// ─── The build script, end to end ────────────────────────────────────────────────────────────

d("build-frame-catalog.ts", () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-frame-catalog-"));
  afterAll(() => {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // a worker may still hold a file on Windows; the system temp folder is cleaned anyway
    }
  });
  let fixtures = 0;
  const botDir = resolve(import.meta.dir, "..");

  /** A database of 6 episodes and a cache of synthetic frames, so no network is needed. */
  async function fixture(): Promise<{ db: string; cache: string }> {
    const home = join(root, `fixture-${++fixtures}`);
    mkdirSync(home, { recursive: true });
    const db = join(home, "bot.db");
    const cache = join(home, "cache");
    const sqlite = new Database(db);
    sqlite.exec(`
      CREATE TABLE db_sagas (id integer primary key, slug text, series text);
      CREATE TABLE db_arcs (id integer primary key, saga_id integer, slug text);
      CREATE TABLE db_episodes (id integer primary key, series text, number_in_series integer,
        title text, title_ja text, duration_sec integer, arc_id integer, frames text, visible integer);
      INSERT INTO db_sagas VALUES (1, 'saga-one', 'DBZ');
      INSERT INTO db_arcs VALUES (1, 1, 'arc-one');
    `);
    for (let e = 1; e <= 6; e++) {
      const frames = [];
      for (let i = 1; i <= 4; i++) {
        const path = `DBZ/ep${String(e).padStart(3, "0")}/frame-${String(i).padStart(5, "0")}.webp`;
        frames.push({ imagePath: `./assets/ext/db_episodes_frames/${path}`, timecodeSec: i * 200 });
        const file = join(cache, path);
        mkdirSync(join(file, ".."), { recursive: true });
        // PNG bytes under a .webp name: the decoder reads the content, not the name
        const kind = (e + i) % 5;
        await Bun.write(
          file,
          kind === 0
            ? await framePng((ctx, w, h) => {
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, w, h);
              })
            : await framePng(scene(60 + ((e * 53 + i * 31) % 200), 110 + ((e * 17 + i * 13) % 50))),
        );
      }
      sqlite
        .query("INSERT INTO db_episodes VALUES (?, 'DBZ', ?, ?, ?, 1440, 1, ?, 1)")
        .run(
          e,
          e,
          `Episode ${e}`,
          e === 3 ? "ついに変身!! 伝説の超サイヤ人" : null,
          JSON.stringify(frames),
        );
    }
    sqlite.close();
    return { db, cache };
  }

  async function run(args: string[]): Promise<string> {
    const child = Bun.spawn([process.execPath, "scripts/build-frame-catalog.ts", ...args], {
      cwd: botDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`build-frame-catalog failed (${code}): ${err}\n${out}`);
    return out;
  }

  test("one worker and several workers write the same bytes, in any order", async () => {
    const { db, cache } = await fixture();
    const common = ["--db", db, "--cache", cache, "--offline", "--per-series", "10"];
    const one = join(root, "one.json");
    const many = join(root, "many.json");
    const report = await run([...common, "--workers", "1", "--inflight", "1", "--out", one]);
    await run([...common, "--workers", "4", "--inflight", "3", "--out", many]);
    const a = await Bun.file(one).text();
    const b = await Bun.file(many).text();
    expect(b).toBe(a);
    expect(report).toContain('"workers": 1');
    expect(report).toContain('"framesPerSec"');
    const catalog = JSON.parse(a) as FrameCatalog;
    expect(catalog.totals.frames).toBe(24);
    expect(catalog.totals.flags.black).toBeGreaterThan(0);
    expect(catalog.series.DBZ!.length).toBeGreaterThan(0);
    expect(catalog.sagas["saga-one"]!.length).toBeGreaterThan(0);
    expect(catalog.arcs["arc-one"]!.length).toBeGreaterThan(0);
    // the black frames never reach a list
    for (const index of catalog.series.DBZ!) expect(catalog.frames[index]!.l).toBeGreaterThan(0.1);
  });

  test("--check fails on a stale file and passes on a fresh one", async () => {
    const { db, cache } = await fixture();
    const out = join(root, "check.json");
    const common = ["--db", db, "--cache", cache, "--offline", "--workers", "2", "--out", out];
    await run(common);
    expect(await run([...common, "--check"])).toContain("equals a fresh build");
    await Bun.write(out, (await Bun.file(out).text()).replace('"version": 1', '"version": 2'));
    await expect(run([...common, "--check"])).rejects.toThrow("differs from a fresh build");
  });

  test("--limit refuses to overwrite the committed catalog", async () => {
    const { db, cache } = await fixture();
    await expect(run(["--db", db, "--cache", cache, "--offline", "--limit", "3"])).rejects.toThrow(
      "--limit needs an explicit --out",
    );
  });
});
