// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { TECHNIQUE_ARTWORK, resolveTechniqueArtwork } from "../src/lib/technique-artwork";
import { uiAssetPaths } from "../../../packages/ui/src/assets";

describe("primary-source technique artwork", () => {
  test("unreviewed creator and game pictures cannot become technique illustrations", () => {
    for (const slug of ["unknown", "__proto__", "constructor", "double-kienzan"]) {
      expect(
        resolveTechniqueArtwork({
          slug,
          image: "/assets/xv2/skill.webp",
          creatorImage: "/assets/dbz/characters/goku.webp",
        }),
      ).toBeNull();
    }
  });

  test("a known technique keeps its reviewed scene when the database image changes", () => {
    const artwork = resolveTechniqueArtwork({ slug: "kienzan", image: "/characters/krilin.webp" });
    expect(artwork?.image).toBe("/techniques/kienzan.webp");
    expect(artwork?.source?.url).toBe("https://dragonballfr.com/wiki/manga/20221?page=9");
  });

  test("dedicated editorial uploads retain their distinct unverified provenance", () => {
    const image = "./assets/wiki/techniques/12345678-abcd-1234-abcd-123456789abc.webp";
    expect(resolveTechniqueArtwork({ slug: "kienzan", image })).toEqual({
      image,
      icon: null,
      medium: "editorial",
      source: null,
    });
  });

  test("editorial fallback rejects foreign hosts, copied portraits and URL suffixes", () => {
    const path = "/assets/wiki/techniques/12345678-abcd-1234-abcd-123456789abc.webp";
    for (const image of [
      `https://example.com${path}`,
      `https://dragonballfr.com.evil.example${path}`,
      `${path}?source=manga`,
      `${path}#manga`,
      path.replace("/techniques/", "/characters/"),
      "/assets/wiki/techniques/unreviewed.svg",
    ]) {
      expect(resolveTechniqueArtwork({ slug: "unknown", image })).toBeNull();
    }
  });

  test("every selected illustration ships with a real image and self-contained vector icon", async () => {
    expect(Object.keys(TECHNIQUE_ARTWORK)).toHaveLength(40);
    for (const artwork of Object.values(TECHNIQUE_ARTWORK)) {
      expect(artwork.medium).toBe("manga");
      expect(new URL(artwork.source.url).hostname).toBe("dragonballfr.com");
      expect(artwork.source.provenance).toBe("dbfc-colorization");
      expect(new URL(artwork.source.url).pathname).toMatch(/^\/wiki\/manga\/20\d{3}$/);
      expect(new URL(artwork.source.url).searchParams.has("page")).toBe(true);
      for (const path of [artwork.image, artwork.icon]) {
        expect(uiAssetPaths.includes(path.slice(1) as (typeof uiAssetPaths)[number])).toBe(true);
      }
      const prefix = `${import.meta.dir}/../../../packages/ui/assets`;
      // The runtime RGBA terminal is newer than the pinned Bun declaration package.
      const decoder = new Bun.Image(`${prefix}${artwork.image}`) as Bun.Image & {
        rgba(): Promise<{ width: number; height: number; data: Uint8Array }>;
      };
      const image = await decoder.rgba();
      expect(image.width).toBeGreaterThan(250);
      expect(image.height).toBeGreaterThan(250);
      expect(image.width * image.height).toBeGreaterThan(180_000);
      expect(image.data.some((value, index) => index % 4 !== 3 && value < 100)).toBe(true);
      let coloredPixels = 0;
      for (let index = 0; index < image.data.length; index += 4) {
        const red = image.data[index]!;
        const green = image.data[index + 1]!;
        const blue = image.data[index + 2]!;
        if (Math.max(red, green, blue) - Math.min(red, green, blue) > 32) coloredPixels++;
      }
      expect(coloredPixels / (image.width * image.height)).toBeGreaterThan(0.02);
      const svg = await Bun.file(`${prefix}${artwork.icon}`).text();
      expect(svg).toContain('viewBox="0 0 96 96"');
      expect(svg).toContain("source SHA-256");
      expect(svg).not.toMatch(/<image\b|<script\b|<foreignObject\b|\bhref=|data:image/i);
    }
  });
});
