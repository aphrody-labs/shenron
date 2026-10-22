// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  characterCode,
  characterFiles,
  messageLines,
  messagePage,
  sceneUrl,
  SCENE_EXTENSIONS,
} from "../src/app/games/dragon-pixel/cpk-scene";
import fr from "../messages/dragon-pixel-scene/fr.json";
import en from "../messages/dragon-pixel-scene/en.json";
import ja from "../messages/dragon-pixel-scene/ja.json";

describe("CPK scene", () => {
  test("selects waveform banks by default rather than streamed cue-sheet metadata", () => {
    expect(SCENE_EXTENSIONS.audio).toBe("awb");
    expect(sceneUrl("data", "wav", "data/sound/SE/Demo/CAR_D05_04_SE.awb")).toBe(
      "/api/public/dbxv2/cpk/data/wav/data/sound/SE/Demo/CAR_D05_04_SE.awb",
    );
  });
  test("uses public routes and escapes entry names", () => {
    expect(sceneUrl()).toBe("/api/public/dbxv2/cpk");
    expect(sceneUrl("data", "model", "chara/GOK/body.emd.glb")).toBe(
      "/api/public/dbxv2/cpk/data/model/chara/GOK/body.emd.glb",
    );
    expect(sceneUrl("data", "wav", "sound/voice 1.acb")).toContain("voice%201.acb");
    expect(() => sceneUrl("../data", "find")).toThrow();
    expect(() => sceneUrl("data", "raw", "../secret")).toThrow();
    expect(() => sceneUrl("data", "raw", "a\\secret")).toThrow();
  });
  test("preserves duplicate, empty and whitespace lines across every page", () => {
    const lines = [
      "実際の台詞",
      "実際の台詞",
      "",
      "  ",
      ...Array.from({ length: 201 }, (_, index) => `line${index}`),
    ];
    const decoded = messageLines([{ lines }]);
    expect(decoded).toEqual(lines);
    expect(messagePage(decoded, 0)).toHaveLength(100);
    expect(messagePage(decoded, 100)).toHaveLength(100);
    expect(messagePage(decoded, 200)).toHaveLength(5);
    const pages = [0, 100, 200].flatMap((offset) => messagePage(decoded, offset));
    expect(pages.map((line) => line.text)).toEqual(lines);
    expect(new Set(pages.map((line) => line.key)).size).toBe(lines.length);
  });
  test("all scene labels exist in all languages", () => {
    expect(Object.keys(en).toSorted()).toEqual(Object.keys(fr).toSorted());
    expect(Object.keys(ja).toSorted()).toEqual(Object.keys(fr).toSorted());
    for (const dictionary of [fr, en, ja])
      for (const label of Object.values(dictionary)) expect(label.trim().length).toBeGreaterThan(0);
  });
});

describe("character files", () => {
  const paths = [
    "data/chara/APL/APL.ean",
    "data/chara/APL/APL.cam.ean",
    "data/chara/APL/APL_000.esk",
    "data/chara/APL/APL_000_LOD01.esk",
    "data/chara/APL/APL_000_Bust.emd",
    "data/chara/APL/APL_000_Bust.emb",
    "data/chara/APL/APL_000_Bust.emm",
    "data/chara/APL/APL_000_Bust.dyt.emb",
    "data/chara/APL/APL_000_Bust_LOD01.emd",
    "data/chara/APL/APL_000_Face_Ear.emd",
    "data/chara/APL/APL_000_Face_ear.dyt.emb",
    "data/chara/APL/APL_000_skirt_scd.emd",
    "data/chara/APL/APL_001_Boots.emd",
  ];
  test("resolves skeleton, animations and full-detail parts with their files", () => {
    expect(characterFiles("APL", paths)).toEqual({
      esk: "data/chara/APL/APL_000.esk",
      ean: "data/chara/APL/APL.ean",
      parts: [
        {
          emd: "data/chara/APL/APL_000_Bust.emd",
          emb: "data/chara/APL/APL_000_Bust.emb",
          emm: "data/chara/APL/APL_000_Bust.emm",
          dyt: "data/chara/APL/APL_000_Bust.dyt.emb",
        },
        {
          emd: "data/chara/APL/APL_000_Face_Ear.emd",
          emb: undefined,
          emm: undefined,
          dyt: "data/chara/APL/APL_000_Face_ear.dyt.emb",
        },
      ],
    });
  });
  test("returns null without skeleton, animations or parts, and validates codes", () => {
    expect(
      characterFiles(
        "APL",
        paths.filter((p) => !p.endsWith("APL.ean")),
      ),
    ).toBeNull();
    expect(characterFiles("GOK", paths)).toBeNull();
    expect(characterCode(" apl ")).toBe("APL");
    expect(characterCode("../x")).toBeNull();
  });
});
