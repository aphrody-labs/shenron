// SPDX-License-Identifier: Apache-2.0
import { schemeFromSeed } from "@aphrody/m3-tokens/dynamic-color";
import reference from "../src/episode-theme-reference.json";

const aliases = {
  "--dbz-bg": "surface",
  "--dbz-card": "surface-container-low",
  "--dbz-border": "outline-variant",
  "--dbz-orange": "primary",
  "--dbz-orange-dark": "primary",
  "--dbz-blue": "secondary-container",
  "--dbz-blue-light": "secondary",
  "--dbz-yellow": "tertiary",
  "--dbz-red": "error",
  "--dbz-purple": "primary",
  "--dbz-gold": "tertiary",
  "--dbz-cyan": "secondary",
  "--dbz-ember": "primary",
  "--dbz-ki": "secondary",
  "--dbz-amber": "tertiary",
  "--dbz-encre": "scrim",
  "--dbz-os": "on-surface",
  "--frame-on-primary": "on-primary",
  "--frame-on-surface-variant": "on-surface-variant",
  "--frame-on-error": "on-error",
  "--background": "surface",
  "--foreground": "on-surface",
  "--card": "surface-container-low",
  "--card-foreground": "on-surface",
  "--popover": "surface-container-high",
  "--popover-foreground": "on-surface",
  "--primary": "primary",
  "--primary-foreground": "on-primary",
  "--secondary": "secondary-container",
  "--secondary-foreground": "on-secondary-container",
  "--accent": "primary-container",
  "--accent-foreground": "on-primary-container",
  "--muted": "surface-container-high",
  "--muted-foreground": "on-surface-variant",
  "--border": "outline-variant",
  "--input": "outline",
  "--ring": "primary",
  "--destructive": "error",
  "--destructive-foreground": "on-error",
} as const;

const palette: Record<string, Record<string, string>> = {};
const blocks = reference.themes.map((theme) => {
  const options = {
    dark: theme.dark,
    variant: "vibrant" as const,
    contrastLevel: reference.contrastLevel,
  };
  const roles = schemeFromSeed(theme.primary, options);
  for (const family of ["secondary", "tertiary"] as const) {
    const familyRoles = schemeFromSeed(theme[family], options);
    for (const [name, value] of Object.entries(familyRoles)) {
      if (name.includes(`-${family}`) || name.includes(`-on-${family}`))
        roles[name] = familyRoles[name.replace(family, "primary")] ?? value;
    }
  }
  const selector =
    theme.id === "beerus"
      ? ':root:root:not([data-episode-theme="goku"])'
      : ':root[data-episode-theme="goku"]';
  palette[theme.id] = Object.fromEntries(
    Object.entries({
      background: "surface",
      foreground: "on-surface",
      primary: "primary",
      onPrimary: "on-primary",
      focus: "secondary",
    }).map(([name, role]) => [name, roles[`--md-sys-color-${role}`]!]),
  );
  const declarations = [
    `  color-scheme: ${theme.dark ? "dark" : "light"};`,
    ...Object.entries(roles).map(([name, color]) => `  ${name}: ${color};`),
    ...Object.entries(aliases).map(([name, role]) => `  ${name}: var(--md-sys-color-${role});`),
  ];
  return `${selector} {\n${declarations.join("\n")}\n}`;
});
const css = `/* SPDX-License-Identifier: Apache-2.0 */\n/* Generated from inspected episode 875 frames; run packages/ui/scripts/generate-episode-themes.ts. */\n${blocks.join("\n\n")}\n`;
const outputs = {
  "episode-themes.css": css,
  "episode-theme-palette.json": JSON.stringify(palette, null, 2) + "\n",
};
for (const [name, output] of Object.entries(outputs)) {
  const file = Bun.file(new URL(`../src/${name}`, import.meta.url));
  if (Bun.argv.includes("--check")) {
    if ((await file.text()) !== output) throw new Error("Episode color roles are stale");
  } else await Bun.write(file, output);
}
