// SPDX-License-Identifier: Apache-2.0
import palette from "../assets/brand/home-palette.json";
export function homeThemeCss() {
  const lines = [
    "/* Generated from packages/ui/assets/brand/home-palette.json. SPDX-License-Identifier: Apache-2.0 */",
    "html:root {",
    ...Object.entries(palette.brand).map(([role, hex]) => `  --brand-${role}: ${hex};`),
    ...Object.entries(palette.media).map(([role, hex]) => `  --media-${role}: ${hex};`),
    "}",
  ];
  for (const [theme, roles] of Object.entries(palette.themes)) {
    lines.push(
      theme === "goku"
        ? 'html:root:root[data-episode-theme="goku"] {'
        : 'html:root:root:not([data-episode-theme="goku"]) {',
      `  color-scheme: ${theme === "goku" ? "light" : "dark"};`,
      ...Object.entries(roles).map(([role, hex]) => `  --md-sys-color-${role}: ${hex};`),
      "}",
    );
  }
  return lines.join("\n") + "\n";
}
if (import.meta.main) {
  const path = `${import.meta.dir}/../src/home-theme.generated.css`,
    content = homeThemeCss();
  if (Bun.argv.includes("--check")) {
    if ((await Bun.file(path).text()) !== content) throw new Error("Home theme CSS drift");
  } else await Bun.write(path, content);
}
