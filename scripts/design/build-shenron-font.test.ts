// SPDX-License-Identifier: OFL-1.1
import { describe, expect, test } from "bun:test";
import { checksum, deriveFont, readTables } from "./build-shenron-font";

describe("Shenron Text derivative", () => {
  test("web subsets preserve file bounds and publish actual Unicode coverage", async () => {
    const root = `${import.meta.dir}/../../apps/site/public/fonts/shenron-text`;
    const faces = (await Bun.file(`${root}/subsets.json`).json()) as {
      file: string;
      bytes: number;
      unicodeRange: string;
    }[];
    expect(faces).toHaveLength(2);
    for (const face of faces) {
      const data = Buffer.from(
        await Bun.file(`${import.meta.dir}/../../${face.file}`).arrayBuffer(),
      );
      expect(data.toString("ascii", 0, 4)).toBe("wOF2");
      expect(data.readUInt32BE(8)).toBe(data.length);
      expect(face.bytes).toBe(data.length);
      expect(data.length).toBeLessThan(100000);
      const ranges = face.unicodeRange.split(", ").map((range) =>
        range
          .slice(2)
          .split("-")
          .map((value) => Number.parseInt(value, 16)),
      );
      for (const character of "ÉéàâçèêëîïôùûüÿœŒ«»’…") {
        const point = character.codePointAt(0)!;
        expect(ranges.some(([start, end = start]) => point >= start! && point <= end!)).toBe(true);
      }
    }
  });
  test.skipIf(Bun.env.SHENRON_FONTTOOLS_VERIFY !== "1")(
    "fontTools decodes WOFF2 with retained metrics, accents and license",
    async () => {
      const verification = `from pathlib import Path
from fontTools.ttLib import TTFont
import sys
root = Path(sys.argv[1])
for style in ('Medium', 'Bold'):
    source = TTFont(root / ('ShenronText-' + style + '.ttf'), checkChecksums=2)
    web = TTFont(root / ('ShenronText-' + style + '.woff2'), checkChecksums=2)
    source_cmap, web_cmap = source.getBestCmap(), web.getBestCmap()
    for cp, glyph in web_cmap.items():
        original = source_cmap[cp]
        assert web['hmtx'][glyph] == source['hmtx'][original], hex(cp)
        assert web['glyf'][glyph].getCoordinates(web['glyf'])[0] == source['glyf'][original].getCoordinates(source['glyf'])[0], hex(cp)
    for ch in 'ÉéàâçèêëîïôùûüÿœŒ«»’…':
        assert ord(ch) in web_cmap
    for tag in ('GPOS', 'GSUB', 'GDEF'):
        assert tag in web
    for name_id in (0, 13, 14):
        original = {(n.platformID, n.platEncID, n.langID, n.toUnicode()) for n in source['name'].names if n.nameID == name_id}
        retained = {(n.platformID, n.platEncID, n.langID, n.toUnicode()) for n in web['name'].names if n.nameID == name_id}
        assert original == retained, name_id
    print(style, len(web_cmap), 'codepoints; decoded metrics, contours and notices preserved')`;
      const child = Bun.spawn(
        [
          process.execPath,
          "uv",
          "run",
          "--quiet",
          "--no-project",
          "--with",
          "fonttools==4.60.1",
          "--with",
          "brotli==1.1.0",
          "python",
          "-c",
          verification,
          `${import.meta.dir}/../../apps/site/public/fonts/shenron-text`,
        ],
        { stdout: "pipe", stderr: "pipe", timeout: 30000 },
      );
      const [output, error, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(error).toBe("");
      expect(code).toBe(0);
      expect(output).toContain("contours and notices preserved");
    },
    35000,
  );
  for (const style of ["Medium", "Bold"] as const) {
    test(`${style}: reproducible, valid checksums, preserved shaping and accents`, async () => {
      const source = Buffer.from(
        await Bun.file(
          `${import.meta.dir}/../../apps/site/public/fonts/Inter-${style}.ttf`,
        ).arrayBuffer(),
      );
      const font = deriveFont(source, style);
      const artifact = Buffer.from(
        await Bun.file(
          `${import.meta.dir}/../../apps/site/public/fonts/shenron-text/ShenronText-${style}.ttf`,
        ).arrayBuffer(),
      );
      expect(font.equals(artifact)).toBe(true);
      expect(checksum(font)).toBe(0xb1b0afba);
      const before = new Map(readTables(source).map(({ tag, data }) => [tag, data]));
      const after = new Map(readTables(font).map(({ tag, data }) => [tag, data]));
      // cmap/contours retain all language coverage; shaping and kerning remain byte-identical.
      for (const tag of [
        "cmap",
        "glyf",
        "loca",
        "GPOS",
        "GSUB",
        "GDEF",
        "maxp",
        "fpgm",
        "prep",
        "cvt ",
      ]) {
        expect(after.get(tag)!.equals(before.get(tag)!)).toBe(true);
      }
      const spacing = Math.round(before.get("head")!.readUInt16BE(18) * 0.01);
      const metrics = before.get("hmtx")!;
      const updated = after.get("hmtx")!;
      const count = before.get("hhea")!.readUInt16BE(34);
      let changed = 0;
      let preservedZero = 0;
      for (let index = 0; index < count; index++) {
        const advance = metrics.readUInt16BE(index * 4);
        expect(updated.readUInt16BE(index * 4)).toBe(advance > 0 ? advance + spacing : 0);
        expect(updated.readInt16BE(index * 4 + 2)).toBe(
          metrics.readInt16BE(index * 4 + 2) + (advance > 0 ? Math.floor(spacing / 2) : 0),
        );
        if (advance > 0) changed++;
        else preservedZero++;
      }
      expect(changed).toBeGreaterThan(1000);
      expect(preservedZero).toBeGreaterThan(0);
      const name = after.get("name")!;
      const countNames = name.readUInt16BE(2);
      const storage = name.readUInt16BE(4);
      let familyFound = false;
      let copyrightFound = false;
      for (let index = 0; index < countNames; index++) {
        const record = 6 + index * 12;
        if (name.readUInt16BE(record) !== 3) continue;
        const start = storage + name.readUInt16BE(record + 10);
        const text = Buffer.from(name.subarray(start, start + name.readUInt16BE(record + 8)))
          .swap16()
          .toString("utf16le");
        if (name.readUInt16BE(record + 6) === 1) familyFound ||= text === "Shenron Text";
        if (name.readUInt16BE(record + 6) === 0)
          copyrightFound ||= text.includes("The Inter Project Authors");
      }
      expect(familyFound).toBe(true);
      expect(copyrightFound).toBe(true);
      for (let index = 0; index < font.readUInt16BE(4); index++) {
        const record = 12 + index * 16;
        const tag = font.toString("ascii", record, record + 4);
        const bytes = Buffer.from(after.get(tag)!);
        if (tag === "head") bytes.writeUInt32BE(0, 8);
        expect(checksum(bytes)).toBe(font.readUInt32BE(record + 4));
      }
    });
  }
});
