// SPDX-License-Identifier: Apache-2.0
import {
  WORDMARK_LETTERS,
  WORDMARK_FRANCE_GLYPHS,
} from "@aphrody/shenron-ui/toriyama-svg/wordmark";

export const LETTERING_COVERAGE = "DRAGNBLFCE";
export const LETTERING_GLYPHS = {
  D: [WORDMARK_LETTERS[0].d, WORDMARK_LETTERS[6].d],
  R: [WORDMARK_LETTERS[1].d, WORDMARK_LETTERS[5].d],
  A: [WORDMARK_LETTERS[2].d, WORDMARK_LETTERS[7].d],
  G: [WORDMARK_LETTERS[3].d],
  N: [WORDMARK_LETTERS[4].d],
  B: [WORDMARK_LETTERS[11].d, WORDMARK_LETTERS[12].d, WORDMARK_LETTERS[14].d],
  L: [WORDMARK_LETTERS[9].d],
  F: [WORDMARK_FRANCE_GLYPHS[0]],
  C: [WORDMARK_FRANCE_GLYPHS[4]],
  E: [WORDMARK_FRANCE_GLYPHS[5]],
};

const FONT_BUILD = `import json, sys
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont
payload = json.load(sys.stdin)
root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
glyphs, metrics, cmap, details = {}, {}, {}, {}
empty = TTGlyphPen(None)
glyphs['space'] = empty.glyph()
metrics['space'] = (300, 0)
cmap[32] = 'space'
def glyph(paths):
    bounds = BoundsPen(None)
    for path in paths: parse_path(path, bounds)
    x0,y0,x1,y1 = bounds.bounds
    scale = 800 / (y1-y0)
    pen = TTGlyphPen(None)
    transform = (scale,0,0,-scale,40-x0*scale,y1*scale)
    for index,path in enumerate(paths):
        probe = TTGlyphPen(None)
        parse_path(path, TransformPen(probe, transform))
        shape = probe.glyph()
        coordinates, ends, flags = shape.getCoordinates({})
        start = 0
        areas = []
        for end in ends:
            contour = list(coordinates[start:end+1])
            area = sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(contour, contour[1:]+contour[:1]))
            areas.append(area)
            start = end+1
        # Separate paths following the first are counters. Enforce TrueType winding.
        want_positive = index > 0
        reverse = bool(areas and ((areas[0] > 0) != want_positive))
        target = ReverseContourPen(pen) if reverse else pen
        parse_path(path, TransformPen(target, transform))
    result = pen.glyph()
    result.recalcBounds({})
    advance = round((x1-x0)*scale)+80
    return result,(advance,40), {'advance':advance,'bounds':[result.xMin,result.yMin,result.xMax,result.yMax], 'contours':result.numberOfContours}
notdef, ndmetrics, _ = glyph(['M0 0H6V8H0Z','M1 1V7H5V1Z'])
glyphs['.notdef'],metrics['.notdef'] = notdef,ndmetrics
for char,paths in payload['glyphs'].items():
    name = 'uni'+format(ord(char),'04X')
    glyphs[name],metrics[name],details[char] = glyph(paths)
    cmap[ord(char)] = name
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(['.notdef','space']+sorted(n for n in glyphs if n not in ('.notdef','space')))
fb.setupCharacterMap(cmap)
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=850,descent=-150,lineGap=0)
fb.setupNameTable({'familyName':'Shenron Lettering','styleName':'Bold','uniqueFontIdentifier':'ShenronLettering-1.000','fullName':'Shenron Lettering Bold','psName':'ShenronLettering-Bold','version':'Version 1.000','copyright':'Dragon Ball artwork: Bird Studio / Shueisha / Toei Animation. Lettering adaptation for Dragon Ball France.','licenseDescription':'Artwork-derived lettering; no SIL OFL or general redistribution license is asserted. See NOTICE.txt distributed with this face.'})
fb.setupOS2(sTypoAscender=850,sTypoDescender=-150,sTypoLineGap=0,usWinAscent=850,usWinDescent=150,usWeightClass=700,sCapHeight=800,sxHeight=0,fsSelection=32)
fb.setupPost()
fb.setupMaxp()
fb.font['head'].created = 2082844800
fb.font['head'].modified = 2082844800
fb.font['head'].macStyle = 1
fb.font['head'].flags &= ~2
fb.font.recalcTimestamp = False
ttf = root / 'ShenronLettering-Bold.ttf'
woff = root / 'ShenronLettering-Bold.woff2'
fb.save(ttf)
fb.font.flavor = 'woff2'
fb.save(woff)
font = TTFont(woff, checkChecksums=2)
assert set(font.getBestCmap()) == set(cmap)
assert font['head'].unitsPerEm == 1000
json.dump({'glyphs':details,'unitsPerEm':1000,'capHeight':800,'ascent':850,'descent':-150,'ttfBytes':ttf.stat().st_size,'woff2Bytes':woff.stat().st_size},sys.stdout)
`;

export async function buildLettering(output: string) {
  const child = Bun.spawn(
    [
      ...(Bun.which("uv") ? [Bun.which("uv")!] : [process.execPath, "uv"]),
      "run",
      "--quiet",
      "--no-project",
      "--with",
      "fonttools==4.60.1",
      "--with",
      "brotli==1.1.0",
      "python",
      "-c",
      FONT_BUILD,
      output,
    ],
    {
      stdin: new TextEncoder().encode(JSON.stringify({ glyphs: LETTERING_GLYPHS })),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30000,
    },
  );
  const [result, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`FontTools lettering failed (${code}): ${error}`);
  const metrics = JSON.parse(result) as {
    glyphs: Record<string, { advance: number; bounds: number[]; contours: number }>;
    unitsPerEm: number;
    capHeight: number;
    ascent: number;
    descent: number;
    ttfBytes: number;
    woff2Bytes: number;
  };
  const source = Bun.file(`${import.meta.dir}/../../packages/ui/src/toriyama-svg/wordmark.ts`);
  const metadata = {
    schema: "shenron-lettering/v1",
    family: "Shenron Lettering",
    weight: 700,
    coverage: [...LETTERING_COVERAGE].toSorted().join(""),
    excludes:
      "O, lowercase, accents and every other unsupported character; the logo O is the canonical SVG cloud",
    unicodeRange: "U+0020,U+0041-0047,U+004C,U+004E,U+0052",
    source: {
      owner: "packages/ui/src/toriyama-svg/wordmark.ts",
      sha256: new Bun.CryptoHasher("sha256").update(await source.arrayBuffer()).digest("hex"),
    },
    ...metrics,
  };
  await Bun.write(`${output}/metadata.json`, JSON.stringify(metadata, null, 2) + "\n");
  return metadata;
}
if (import.meta.main) {
  const output = Bun.argv[2] ?? `${import.meta.dir}/../../apps/site/public/fonts/shenron-lettering`;
  console.log(JSON.stringify(await buildLettering(output), null, 2));
}
