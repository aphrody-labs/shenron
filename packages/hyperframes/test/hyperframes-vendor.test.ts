// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  parseAtoms,
  findAtom,
  HyperFramesDecoder,
  DRAGON_BALL_HERO_TIMECODES,
  computeSceneTimecodes,
  buildCdnAssetUrls,
} from "../src/index";

describe("@aphrody/hyperframes stream & atom parsing", () => {
  it("parses MP4 binary atom headers correctly", () => {
    // Construct synthetic ftyp + moov buffer
    const buffer = new Uint8Array(32);
    // ftyp atom: size 16 (0x00000010), type 'ftyp'
    buffer[0] = 0x00;
    buffer[1] = 0x00;
    buffer[2] = 0x00;
    buffer[3] = 0x10;
    buffer[4] = 0x66;
    buffer[5] = 0x74;
    buffer[6] = 0x79;
    buffer[7] = 0x70;
    // moov atom: size 16 (0x00000010), type 'moov'
    buffer[16] = 0x00;
    buffer[17] = 0x00;
    buffer[18] = 0x00;
    buffer[19] = 0x10;
    buffer[20] = 0x6d;
    buffer[21] = 0x6f;
    buffer[22] = 0x6f;
    buffer[23] = 0x76;

    const atoms = parseAtoms(buffer);
    expect(atoms.length).toBe(2);
    expect(atoms[0].type).toBe("ftyp");
    expect(atoms[0].size).toBe(16);
    expect(atoms[1].type).toBe("moov");
    expect(atoms[1].size).toBe(16);

    const found = findAtom(buffer, "moov");
    expect(found).toBeDefined();
    expect(found?.offset).toBe(16);
  });
});

describe("@aphrody/hyperframes decoder & dragon ball streaming", () => {
  it("computes 41 scene timecodes for Dragon Ball episodes", () => {
    const timecodes = computeSceneTimecodes(1440, 41);
    expect(timecodes.length).toBe(41);
    expect(timecodes[0]).toBeGreaterThanOrEqual(48.5);
    expect(timecodes[40]).toBeLessThanOrEqual(1440 - 32.5);
    // Verify ascending order
    for (let i = 1; i < timecodes.length; i++) {
      expect(timecodes[i]).toBeGreaterThan(timecodes[i - 1]);
    }
  });

  it("exposes canonical hero timecodes and builds CDN URLs", () => {
    expect(DRAGON_BALL_HERO_TIMECODES).toEqual([240, 600, 1115]);
    const urls = buildCdnAssetUrls(5);
    expect(urls.sourceMp4).toContain("/media/episodes/5/source.mp4");
    expect(urls.hero240).toContain("/media/episodes/5/hero-240.webp");
    expect(urls.hero600).toContain("/media/episodes/5/hero-600.webp");
    expect(urls.hero1115).toContain("/media/episodes/5/hero-1115.webp");
  });

  it("initializes HyperFramesDecoder with cache management", () => {
    const decoder = new HyperFramesDecoder({
      maxMemoryCacheMb: 64,
      enableWebCodecsGpu: true,
      preferredCodec: "avc1.640028",
    });

    const status = decoder.getStatus();
    expect(status.cacheCount).toBe(0);
    expect(status.preferredCodec).toBe("avc1.640028");
    expect(status.gpuAccelerated).toBe(true);

    decoder.clearCache();
    expect(decoder.getStatus().cacheCount).toBe(0);
  });
});
