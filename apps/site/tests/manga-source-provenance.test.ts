import { describe, expect, it } from "bun:test";

const languages = ["fr", "en", "ja"] as const;

describe("Dragon Ball color-scan provenance", () => {
  it("labels the existing French scan forum archive separately from the Japanese edition", async () => {
    const dictionaries = await Promise.all(
      languages.map(
        async (language) =>
          (await Bun.file(new URL(`../messages/${language}.json`, import.meta.url)).json()) as {
            mangaCatalog: Record<string, string>;
          },
      ),
    );

    for (const dictionary of dictionaries) {
      const catalog = dictionary.mangaCatalog;
      expect(catalog.colorTabTitle).toBeTruthy();
      expect(catalog.colorTabDescription.toLowerCase()).toContain("scan-db");
      expect(catalog.colorPanelDescription.toLowerCase()).toContain("scan-db");
      expect(catalog.colorPanelDescription).toMatch(/original|オリジナル/i);
      expect(catalog.japaneseOriginalCatalogueStatus).toBeTruthy();
      expect(catalog.japaneseOriginalCatalogueStatus).toContain("{printVolumes}");
      expect(catalog.japaneseOriginalCatalogueStatus).toContain("{digitalVolumes}");
      expect(catalog.frenchBlackWhiteScans).toBeTruthy();
    }

    const component = await Bun.file(
      new URL("../src/components/manga/MangaVolumeGrid.tsx", import.meta.url),
    ).text();
    expect(component).not.toContain("L&apos;intégrale officielle colorisée par la Shueisha");
    expect(component).toContain('t("mangaCatalog.colorPanelDescription")');

    const reader = await Bun.file(
      new URL("../src/components/manga/UnifiedVolumeReader.tsx", import.meta.url),
    ).text();
    expect(reader).not.toContain('label: "Original N&B (Tankōbon)"');
    expect(reader).toContain('t("mangaCatalog.frenchBlackWhiteScans")');
  });
});
