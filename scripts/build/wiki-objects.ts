// SPDX-License-Identifier: Apache-2.0
import { svgSphere } from "../plugin/src/toriyama";
import { svgIcone } from "../../packages/ui/src/toriyama-svg/senzu";

// Compose the maintained geometry; do not duplicate paths or embed source scans.
const assets = {
  "dragon-ball-one-star.svg": svgSphere(1).replace(
    "</title>",
    "</title><desc>Illustration vectorielle mesurée, distincte de l’image officielle. Géométrie de la couverture du tome 1 ; cerne adapté depuis le logo DBS.</desc>",
  ),
  "senzu-icon.svg": svgIcone()
    .replace(
      'role="img" aria-label="Senzu"',
      'role="img" aria-labelledby="senzu-title senzu-description"',
    )
    .replace(
      "><defs>",
      '><title id="senzu-title">Senzu</title><desc id="senzu-description">Illustration vectorielle mesurée. Palette de la colorisation française DBFC ; distincte de l’image officielle.</desc><defs>',
    ),
};

for (const [name, svg] of Object.entries(assets)) {
  if (/<(?:image|foreignObject|script)\b|(?:href|src)\s*=|data:image/i.test(svg)) {
    throw new Error(`Non-vector or external content in ${name}`);
  }
  const path = `${import.meta.dir}/../../packages/ui/assets/wiki-objects/${name}`;
  if (Bun.argv.includes("--check")) {
    if (!(await Bun.file(path).exists()) || (await Bun.file(path).text()) !== svg) {
      throw new Error(`Regenerate ${path}`);
    }
  } else {
    await Bun.write(path, svg);
  }
  console.log(`${name}: ${new TextEncoder().encode(svg).length} bytes`);
}
