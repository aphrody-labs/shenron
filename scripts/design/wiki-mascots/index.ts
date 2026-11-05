// SPDX-License-Identifier: Apache-2.0
import { gokuSvg } from "./goku";
import { kidBuuSvg } from "./kid-buu";
import { createShenronSvg } from "./shenron";

const args = Bun.argv.slice(2);
if (args.some((arg) => arg !== "--check"))
  throw new Error("Usage: bun scripts/design/wiki-mascots/index.ts [--check]");
const check = args.includes("--check");
const assets = [
  { id: "goku", svg: gokuSvg() },
  { id: "kid-buu", svg: kidBuuSvg() },
  { id: "shenron", svg: createShenronSvg() },
];
const results = [];
for (const asset of assets) {
  const destination = new URL(
    `../../../packages/ui/assets/wiki-mascots/${asset.id}-full.svg`,
    import.meta.url,
  );
  if (
    !asset.svg.includes("<svg") ||
    /<(?:image|script|foreignObject)\b|data:image\//i.test(asset.svg)
  ) {
    throw new Error(`Invalid standalone vector asset: ${asset.id}`);
  }
  const paths = asset.svg.match(/<path\b/g)?.length ?? 0;
  if (paths === 0) throw new Error(`Missing vector geometry: ${asset.id}`);
  if (check) {
    if ((await Bun.file(destination).text()) !== asset.svg)
      throw new Error(`Generated SVG drift: ${asset.id}`);
  } else await Bun.write(destination, asset.svg);
  results.push({
    id: asset.id,
    paths,
    bytes: new TextEncoder().encode(asset.svg).length,
    sha256: Bun.CryptoHasher.hash("sha256", asset.svg, "hex"),
    kind: "original-stylized-vector",
  });
}
console.log(JSON.stringify({ status: check ? "checked" : "written", assets: results }, null, 2));
