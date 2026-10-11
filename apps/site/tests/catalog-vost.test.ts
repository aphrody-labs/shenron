// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  normalizeVideoLanguage,
  normalizeAvailability,
  playersForVideoLanguage,
  resolveVideoSelection,
  videoLanguages,
} from "../src/lib/video-languages";
import { langBadges } from "../src/lib/media";
import { validateCatalogEditorialBody } from "../src/lib/catalog-editorial-contracts";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";

describe("observed VOST versions", () => {
  test("an unknown tag or Japanese title never implies a video version", () => {
    for (const value of [undefined, null, "ja", "vo", "unknown", "en", "VOST"]) {
      expect(normalizeVideoLanguage(value)).toBeNull();
    }
    expect(
      videoLanguages([{ titleJa: "ドラゴンボール", embedUrl: "https://example.test/japanese" }]),
    ).toEqual([]);
    expect(langBadges([{ lang: "ja" }])).toEqual({
      hasVf: false,
      hasVostfr: false,
      hasVost: false,
    });
  });
  test("VOST remains separate from French subtitles and the French dub", () => {
    expect(videoLanguages([{ lang: "vost" }, { lang: "vostfr" }, { lang: "vf" }])).toEqual([
      "vf",
      "vostfr",
      "vost",
    ]);
    expect(langBadges([{ lang: "vost" }])).toEqual({
      hasVf: false,
      hasVostfr: false,
      hasVost: true,
    });
  });
  test("unknown sources never become fallback readers of a claimed version", () => {
    const players = [
      { name: "Known", lang: "vost" },
      { name: "Unknown" },
      { name: "Unknown tag", lang: "ja" },
    ];
    expect(playersForVideoLanguage(players, "vost").map((player) => player.name)).toEqual([
      "Known",
    ]);
    expect(playersForVideoLanguage(players, "vostfr")).toEqual([]);
    expect(playersForVideoLanguage(players, null).map((player) => player.name)).toEqual([
      "Unknown",
      "Unknown tag",
    ]);
  });
  test("episode changes replace selections that no longer have a source", () => {
    const mixed = [{ lang: "vost" }, {}];
    expect(resolveVideoSelection(mixed, "ext")).toBe("ext");
    expect(resolveVideoSelection([{ lang: "vost" }], "ext")).toBe("vost");
    expect(resolveVideoSelection([{}], "vost")).toBe("ext");
    expect(resolveVideoSelection(mixed, "vostfr")).toBe("vost");
    expect(resolveVideoSelection([{ lang: "vostfr" }], "vostfr")).toBe("vostfr");
  });
  test("the episode writer accepts explicit VOST without inventing subtitles", () => {
    const result = validateCatalogEditorialBody("db_episodes", {
      players: [
        {
          name: "Source",
          provider: "observed",
          embedUrl: "https://example.test/embed",
          lang: "vost",
        },
      ],
      availability: [
        {
          provider: "observed",
          label: "Observed provider",
          url: "https://example.test/episode",
          embedUrl: null,
          langs: ["vost"],
          available: true,
          checkedAt: 1_700_000_000,
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Fixture must be valid");
    expect(result.value.subtitles).toBeUndefined();
  });
  test("unavailable and unidentified offers do not produce an official supplier label", () => {
    const offer = {
      provider: "observed",
      label: "Observed",
      url: "https://example.test/episode",
      langs: ["vost", "unknown"],
      available: true,
    };
    expect(normalizeAvailability([offer])?.[0]?.langs).toEqual(["vost"]);
    expect(normalizeAvailability([{ ...offer, available: false }])).toBeNull();
    expect(normalizeAvailability([{ ...offer, available: undefined }])).toBeNull();
    expect(normalizeAvailability([{ ...offer, provider: "", label: "" }])).toBeNull();
    expect(normalizeAvailability([{ ...offer, langs: ["ja"] }])?.[0]?.langs).toEqual([]);
  });
  test("all playback keys and VOST labels exist in the three dictionaries", () => {
    const keys = Object.keys(fr.mediaPlayback).sort();
    expect(Object.keys(en.mediaPlayback).sort()).toEqual(keys);
    expect(Object.keys(ja.mediaPlayback).sort()).toEqual(keys);
    for (const messages of [fr, en, ja]) {
      expect(messages.mediaPlayback.vost.length).toBeGreaterThan(0);
      expect(messages.mediaPlayback.vost).not.toBe(messages.mediaPlayback.vostfr);
    }
  });
});
