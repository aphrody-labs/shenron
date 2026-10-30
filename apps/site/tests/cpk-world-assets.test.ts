// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import {
  MAX_STAGE_BYTES,
  MAX_STAGE_PARTS,
  defaultStage,
  discoverStages,
  loadStage,
  stagesFromEntries,
  stagePartsFromLayout,
  resolveStageReference,
  type CpkStage,
} from "../src/components/dragon-world/cpk-world-assets";
import type { Xv2StageLayoutInfo } from "@aphrody/shenron-engine/glb-scene";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const entry = (path: string, extract_size = 1) => ({ path, extract_size });

describe("real CPK world resources", () => {
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1];
  const layout: Xv2StageLayoutInfo = {
    resources: {
      nsk: ["LBY\\shared.nsk", "CHARA\\object.nsk"],
      emb: ["BFlbn\\town.emb", "LBY\\other.emb"],
      emm: ["CHARA\\object.emm"],
      ema: [],
    },
    instances: [
      { nsk: 0, emb: 0, matrix },
      { nsk: 0, emb: 0, matrix: matrix.map((value, i) => (i === 12 ? 99 : value)) },
      { nsk: 0, emb: 1, matrix },
      { nsk: 1, emb: 0, emm: 0, matrix },
    ],
    spawns: [],
    lodIndex: 0,
  };
  const catalogue = [
    entry("data/stage/LBY/shared.nsk"),
    entry("data/stage/CHARA/object.nsk"),
    entry("data/stage/BFlbn/town.emb"),
    entry("data/stage/LBY/other.emb"),
    entry("data/stage/CHARA/object.emm"),
    entry("data/stage/LBY/shared.emb"),
  ];

  test("discovers observed FMP/EVE and retains the shared global resource catalogue", () => {
    const stages = stagesFromEntries("data", [
      ...catalogue,
      entry("data/stage/BFlbn.map"),
      entry("data/stage/BFlbn_EVE.map"),
      entry("data/stage/BFlbn_QST.map"),
    ]);
    const town = stages.find((stage) => stage.id === "BFlbn")!;
    expect(town.map?.path).toBe("data/stage/BFlbn.map");
    expect(town.eve?.path).toBe("data/stage/BFlbn_EVE.map");
    expect(town.catalogue?.some((item) => item.path.includes("CHARA/"))).toBe(true);
    expect(stages.some((stage) => stage.id.endsWith("_EVE") || stage.id.endsWith("_QST"))).toBe(
      false,
    );
  });

  test("preserves exact FMP texture/material pairings and cross-folder placements", () => {
    const parts = stagePartsFromLayout(layout, catalogue);
    expect(parts).toHaveLength(3);
    expect(parts[0]!.emb?.path).toBe("data/stage/BFlbn/town.emb");
    expect(parts[0]!.instances).toHaveLength(2);
    expect(parts[0]!.instances[0]).toEqual(new Float32Array(matrix));
    expect(parts[0]!.instances[1]![12]).toBe(99);
    expect(parts[1]!.nsk).toBe(parts[0]!.nsk);
    expect(parts[1]!.emb?.path).toBe("data/stage/LBY/other.emb");
    expect(parts[2]!.emm?.path).toBe("data/stage/CHARA/object.emm");
    expect(parts[0]!.instances[0]!.buffer).not.toBe(parts[1]!.instances[0]!.buffer);
  });

  test("refuses unresolved references, invalid indices and instance limits without substitution", () => {
    expect(resolveStageReference("data/stage/LBY/shared.nsk", catalogue).path).toContain(
      "LBY/shared.nsk",
    );
    for (const reference of [
      "../private.nsk",
      "/LBY/shared.nsk",
      "LBY/missing.nsk",
      "C:/private.nsk",
    ])
      expect(() => resolveStageReference(reference, catalogue)).toThrow("reference");
    const bad = (instances: Xv2StageLayoutInfo["instances"]) => ({ ...layout, instances });
    expect(() => stagePartsFromLayout(bad([{ nsk: 100, matrix }]), catalogue)).toThrow("reference");
    expect(() => stagePartsFromLayout(bad([{ nsk: 0, matrix: [1] }]), catalogue)).toThrow("layout");
    expect(() =>
      stagePartsFromLayout(bad([{ nsk: 0, matrix: matrix.map(() => Infinity) }]), catalogue),
    ).toThrow("layout");
    expect(() =>
      stagePartsFromLayout(
        bad(Array.from({ length: 4097 }, () => layout.instances[0]!)),
        catalogue,
      ),
    ).toThrow("instances");
  });

  test("groups all native NSK parts with only observed texture/material siblings", () => {
    const stages = stagesFromEntries("data", [
      entry("data/stage/BFtok/BFtok01.NSK", 10),
      entry("data/stage/BFtok/bftok01.EMB", 20),
      entry("data/stage/BFtok/BFtok01.emm", 3),
      entry("data/stage/BFtok/BFtokGrass.nsk", 5),
      entry("data/stage/BFtok/BFtok_LOD.nsk", 7),
      entry("data/stage/COM/COM00.nsk", 9),
      entry("data/stage/BFtok/BFtok.spm", 100),
      entry("data/stage/BFtok/unused.emb", 999),
      entry("data/stage/../private.nsk"),
      entry("data/stage/BFtok/../../private.nsk"),
      entry("data/stage/BFtok/x\\private.nsk"),
      entry("data/stage/BFtok/negative.nsk", -3),
      entry("data/chara/GOK/GOK_000_Bust.emd"),
    ]);
    expect(stages.map((stage) => stage.id)).toEqual(["BFtok", "COM"]);
    expect(stages[0]!.parts).toHaveLength(3);
    expect(stages[0]!.bytes).toBe(45);
    const textured = stages[0]!.parts.find((part) => part.path.endsWith("01.NSK"))!;
    expect(textured.emb?.path).toBe("data/stage/BFtok/bftok01.EMB");
    expect(textured.emm?.path).toBe("data/stage/BFtok/BFtok01.emm");
    expect(stages[0]!.parts.find((part) => part.path.endsWith("Grass.nsk"))!.emb).toBeUndefined();
    expect(() => stagesFromEntries("../data", [])).toThrow();
    expect(defaultStage(stages)?.id).toBe("BFtok");
  });

  test("continues across short index pages without losing stage parts", async () => {
    const offsets: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input), "https://dragonballfr.com");
      const offset = url.searchParams.get("offset")!;
      offsets.push(offset);
      return Response.json({
        total: 3,
        offset: Number(offset),
        limit: 1,
        entries: [entry(`data/stage/BFtok/model${offset}.nsk`)],
      });
    }) as typeof fetch;
    const stages = await discoverStages("data", new AbortController().signal);
    expect(offsets).toEqual(["0", "1", "2"]);
    expect(stages[0]!.parts).toHaveLength(3);
  });

  test("split meshes reuse an observed parent texture bank once", async () => {
    const stage = stagesFromEntries("data", [
      entry("data/stage/BFtok/BFtok01.nsk", 10),
      entry("data/stage/BFtok/BFtok01_00.nsk", 5),
      entry("data/stage/BFtok/BFtok01_01.nsk", 7),
      entry("data/stage/BFtok/BFtok01.emb", 20),
    ])[0]!;
    expect(stage.parts.every((part) => part.emb?.path === "data/stage/BFtok/BFtok01.emb")).toBe(
      true,
    );
    expect(stage.bytes).toBe(42);
    const requested: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
      requested.push(String(input));
      const resource = stage.catalogue!.find((asset) => String(input).endsWith(asset.path))!;
      return new Response(new Uint8Array(resource.extract_size));
    }) as typeof fetch;
    const parts = await loadStage(stage, new AbortController().signal);
    expect(requested.filter((url) => url.endsWith("BFtok01.emb"))).toHaveLength(1);
    expect(parts[0]!.emb).toBe(parts[1]!.emb);
  });

  test("rejects broken index pagination instead of looping or claiming completeness", async () => {
    globalThis.fetch = Object.assign(
      async () => Response.json({ total: 20, offset: 0, limit: 10_000, entries: [] }),
      { preconnect: originalFetch.preconnect },
    );
    await expect(discoverStages("data", new AbortController().signal)).rejects.toThrow("index");
  });

  test("rejects a raw stage payload that disagrees with its TOC before assembly", async () => {
    const stage = stagesFromEntries("data", [entry("data/stage/BFtok/model.nsk", 2)])[0]!;
    globalThis.fetch = Object.assign(async () => new Response(new Uint8Array([1])), {
      preconnect: originalFetch.preconnect,
    });
    await expect(loadStage(stage, new AbortController().signal)).rejects.toThrow("index");
  });

  test("bounds requests globally and assembles original parts in stable order", async () => {
    let active = 0,
      peak = 0;
    const urls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      active++;
      peak = Math.max(peak, active);
      urls.push(String(input));
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return new Response(new Uint8Array([urls.length % 255]));
    }) as typeof fetch;
    const stage = stagesFromEntries(
      "data",
      Array.from({ length: 6 }, (_, i) => [
        entry(`data/stage/BFtok/part${i}.nsk`),
        entry(`data/stage/BFtok/part${i}.emb`),
        entry(`data/stage/BFtok/part${i}.emm`),
      ]).flat(),
    )[0]!;
    const progress: [number, number][] = [];
    const parts = await loadStage(stage, new AbortController().signal, (loaded, total) =>
      progress.push([loaded, total]),
    );
    expect(peak).toBe(4);
    expect(urls).toHaveLength(18);
    expect(
      urls.every((url) => url.startsWith("/api/public/dbxv2/cpk/data/raw/data/stage/BFtok/")),
    ).toBe(true);
    expect(parts).toHaveLength(6);
    expect(
      parts.every(
        (part) => part.nsk.length === 1 && part.emb?.length === 1 && part.emm?.length === 1,
      ),
    ).toBe(true);
    expect(progress[0]).toEqual([0, 18]);
    expect(progress.at(-1)).toEqual([18, 18]);
  });

  test("refuses limits before any download and never chooses an oversized default", async () => {
    let calls = 0;
    globalThis.fetch = Object.assign(
      async () => {
        calls++;
        return new Response();
      },
      { preconnect: originalFetch.preconnect },
    );
    const empty: CpkStage = { archive: "data", id: "empty", parts: [], bytes: 0 };
    const large = stagesFromEntries("data", [
      entry("data/stage/LBY/large.nsk", MAX_STAGE_BYTES + 1),
    ])[0]!;
    const many = stagesFromEntries(
      "data",
      Array.from({ length: MAX_STAGE_PARTS + 1 }, (_, i) => entry(`data/stage/LBY/part${i}.nsk`)),
    )[0]!;
    for (const stage of [empty, large, many])
      await expect(loadStage(stage, new AbortController().signal)).rejects.toThrow();
    expect(calls).toBe(0);
    expect(defaultStage([large, many])).toBeUndefined();
  });

  test("loads every part at the configured part boundary without truncation", async () => {
    let requests = 0;
    globalThis.fetch = Object.assign(
      async () => {
        requests++;
        return new Response(new Uint8Array([1]));
      },
      { preconnect: originalFetch.preconnect },
    );
    const stage = stagesFromEntries(
      "data",
      Array.from({ length: MAX_STAGE_PARTS }, (_, i) => entry(`data/stage/LBY/part${i}.nsk`)),
    )[0]!;
    const loaded = await loadStage(stage, new AbortController().signal);
    expect(loaded).toHaveLength(MAX_STAGE_PARTS);
    expect(requests).toBe(MAX_STAGE_PARTS);
  });

  test("cancels queued requests when one original resource is unavailable", async () => {
    let calls = 0;
    let cancellationObserved = false;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const ordinal = calls++;
      if (ordinal === 0) return new Response(null, { status: 404 });
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            cancellationObserved = true;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    }) as typeof fetch;
    const stage = stagesFromEntries(
      "data",
      Array.from({ length: 8 }, (_, i) => entry(`data/stage/BFtok/part${i}.nsk`)),
    )[0]!;
    await expect(loadStage(stage, new AbortController().signal)).rejects.toThrow("HTTP 404");
    expect(calls).toBe(4);
    expect(cancellationObserved).toBe(true);
    const aborted = new AbortController();
    aborted.abort();
    await expect(loadStage(stage, aborted.signal)).rejects.toThrow();
    expect(calls).toBe(4);
  });
});
