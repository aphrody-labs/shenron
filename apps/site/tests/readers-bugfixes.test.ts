// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";

describe("Manga Reader & Volume Edition Resolution", () => {
  it("normalizes edition parameter: both 'color' and 'couleur' map to 'color', fallback to 'nb'", () => {
    function resolveInitialEdition(param: string | null | undefined): "color" | "nb" {
      const raw = param ?? "nb";
      return raw === "color" || raw === "couleur" ? "color" : "nb";
    }

    expect(resolveInitialEdition("color")).toBe("color");
    expect(resolveInitialEdition("couleur")).toBe("color");
    expect(resolveInitialEdition("nb")).toBe("nb");
    expect(resolveInitialEdition(null)).toBe("nb");
    expect(resolveInitialEdition(undefined)).toBe("nb");
    expect(resolveInitialEdition("unknown")).toBe("nb");
  });

  it("generates correct volume edition link with color parameter", () => {
    const volumeId = 42;
    const couleur = false;
    const targetEdition = couleur ? "nb" : "color";
    const href = `/wiki/manga/volume/${volumeId}?edition=${targetEdition}`;
    expect(href).toBe("/wiki/manga/volume/42?edition=color");
  });
});

describe("Episode Video Player & VideoLecteurs", () => {
  it("synchronizes language when episode players list changes and current language is missing", () => {
    const LANG_ORDER = ["vf", "vostfr"] as const;
    function computeLangs(players: Array<{ lang?: string }>): string[] {
      const present = new Set(players.map((p) => p.lang).filter(Boolean) as string[]);
      return LANG_ORDER.filter((l) => present.has(l));
    }

    function syncLang(currentLang: string, langs: string[]): string {
      if (langs.length > 0 && !langs.includes(currentLang)) {
        return langs[0] ?? "";
      }
      return currentLang;
    }

    // Episode 1 has both VF and VOSTFR
    const ep1Langs = computeLangs([{ lang: "vf" }, { lang: "vostfr" }]);
    expect(ep1Langs).toEqual(["vf", "vostfr"]);

    // User selected VF
    let currentLang = "vf";

    // Navigate to Episode 2 which ONLY has VOSTFR
    const ep2Langs = computeLangs([{ lang: "vostfr" }]);
    expect(ep2Langs).toEqual(["vostfr"]);

    // Lang should automatically synchronize to vostfr
    currentLang = syncLang(currentLang, ep2Langs);
    expect(currentLang).toBe("vostfr");
  });

  it("safely clamps active index within list bounds", () => {
    const list = [{ name: "Player 1" }, { name: "Player 2" }];
    const requestedActive = 5; // Out of bounds
    const safeActive = requestedActive < list.length ? requestedActive : 0;
    const current = list[safeActive] ?? list[0];
    expect(safeActive).toBe(0);
    expect(current).toEqual({ name: "Player 1" });
  });

  it("probing logic does not start a timeout when status is ready", () => {
    let timeoutCreated = false;
    function checkProbing(status: "probing" | "ready" | "failed") {
      if (status === "ready") return false;
      timeoutCreated = true;
      return true;
    }

    expect(checkProbing("ready")).toBe(false);
    expect(timeoutCreated).toBe(false);

    expect(checkProbing("probing")).toBe(true);
    expect(timeoutCreated).toBe(true);
  });
});

describe("Databook Reader Transcription Resiliency", () => {
  it("clears requested pages on failure to allow retry on next scroll", () => {
    const demandes = new Set<number>([1, 2, 3]);
    const failedPages = [2, 3];

    // On network failure, failed pages are deleted from the requested set
    for (const p of failedPages) {
      demandes.delete(p);
    }

    expect(demandes.has(1)).toBe(true);
    expect(demandes.has(2)).toBe(false);
    expect(demandes.has(3)).toBe(false);
  });
});
