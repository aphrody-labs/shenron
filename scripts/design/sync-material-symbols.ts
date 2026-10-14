// SPDX-License-Identifier: Apache-2.0
/** Consume the owner catalogue API and ship only the symbols used by Shenron's shell. */
const names = [
  "search",
  "translate",
  "install_desktop",
  "light_mode",
  "dark_mode",
  "more_horiz",
  "download",
  "menu",
  "close",
  "arrow_forward",
  "arrow_back",
  "gif",
  "keyboard_arrow_up",
  "keyboard_arrow_down",
  "pause",
  "play_arrow",
  "volume_up",
  "volume_off",
  "settings",
  "fullscreen",
  "fullscreen_exit",
  "picture_in_picture_alt",
  "theaters",
  "replay_10",
  "forward_10",
  "skip_previous",
  "skip_next",
] as const;
export async function materialSubset(owner: string) {
  const metadata = await Bun.file(`${owner}/package.json`).json();
  if (metadata.name !== "@aphrody/material-design-icons" || metadata.version !== "1.0.0")
    throw new Error("Unqualified Material Symbols owner package");
  const catalog = await import(`${owner}/src/index.ts`);
  const icons: Record<string, { viewBox: string; body: string; sha256: string }> = {};
  for (const name of names) {
    const svg: string = catalog.readSymbolSvg(name, "rounded", 400, false);
    const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
    const body = svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/)?.[1];
    if (
      !viewBox ||
      !body ||
      /<(?!path\b|\/path\b|g\b|\/g\b|circle\b|\/circle\b|rect\b|\/rect\b)|\bon\w+\s*=|\b(?:href|style)\s*=/i.test(
        body,
      )
    )
      throw new Error(`Unsupported symbol markup: ${name}`);
    icons[name] = {
      viewBox,
      body,
      sha256: new Bun.CryptoHasher("sha256").update(svg).digest("hex"),
    };
  }
  return {
    owner: metadata.name,
    version: metadata.version,
    source: "Google Material Symbols Rounded, 400, 24 px",
    license: "Apache-2.0",
    icons,
  };
}
if (import.meta.main) {
  const owner = Bun.argv[2];
  if (!owner) throw new Error("Usage: bun sync-material-symbols.ts <owner-package-root> [--check]");
  const expected = JSON.stringify(await materialSubset(owner), null, 2) + "\n";
  const target = `${import.meta.dir}/../../packages/ui/src/icones/material-symbol-subset.json`;
  if (Bun.argv.includes("--check")) {
    if ((await Bun.file(target).text()) !== expected)
      throw new Error("Material symbol subset differs");
  } else await Bun.write(target, expected);
}
