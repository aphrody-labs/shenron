// SPDX-License-Identifier: Apache-2.0
import { uiAssetPaths } from "@aphrody/shenron-ui/assets";
import { NOMS_ICONES } from "@aphrody/shenron-ui/icones/geometries";
import symbols from "../../packages/ui/src/icones/material-symbol-subset.json";

export async function toriyamaCatalog() {
  const root = `${import.meta.dir}/../..`;
  const components: { name: string; module: string }[] = [];
  for await (const filename of new Bun.Glob("*.tsx").scan(`${root}/packages/ui/src/toriyama`)) {
    const source = await Bun.file(`${root}/packages/ui/src/toriyama/${filename}`).text();
    for (const match of source.matchAll(/export function (\w+)\(/g))
      components.push({
        name: match[1]!,
        module: `@aphrody/shenron-ui/toriyama/${filename.replace(/\.tsx$/, "")}`,
      });
  }
  for (const path of uiAssetPaths) {
    if (!(await Bun.file(`${root}/packages/ui/assets/${path}`).exists()))
      throw new Error(`Missing artwork: ${path}`);
  }
  return {
    schema: "shenron-toriyama-catalog/v1",
    components: components.toSorted((a, b) => a.name.localeCompare(b.name)),
    artwork: uiAssetPaths.map((path) => ({
      path,
      kind: path.endsWith(".svg") ? "svg" : path.endsWith(".json") ? "palette" : "image",
    })),
    glyphs: NOMS_ICONES,
    materialSymbols: {
      owner: symbols.owner,
      version: symbols.version,
      style: "rounded",
      names: Object.keys(symbols.icons),
      loading: "inline-svg-subset",
    },
    typography: {
      brand: "Shenron Text",
      plain: "Shenron Text",
      code: "JetBrains Mono",
      japanese: "Noto Sans JP",
      m3Roles: ["--aphrody-font-brand", "--aphrody-font-plain", "--aphrody-font-code"],
    },
  };
}
if (import.meta.main) {
  const output = `${import.meta.dir}/../../packages/ui/src/toriyama/catalog.json`;
  const data = JSON.stringify(await toriyamaCatalog(), null, 2) + "\n";
  if (Bun.argv.includes("--check")) {
    if (JSON.stringify(await Bun.file(output).json()) !== JSON.stringify(JSON.parse(data)))
      throw new Error("Toriyama catalogue differs");
  } else await Bun.write(output, data);
}
