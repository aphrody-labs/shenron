/**
 * Generates `tokens.generated.ts`, the colours of the card renderer, from the site design
 * tokens (`packages/ui/src/tokens.ts`, itself generated from `packages/ui/src/styles.css`).
 *
 *   bun src/render/generate-tokens.ts          # rewrite tokens.generated.ts
 *   bun src/render/generate-tokens.ts --check  # exit 1 when tokens.generated.ts is stale
 *
 * The bot does not depend on `@aphrody/shenron-ui` (it would pull the whole UI layer into
 * the bot binary), so the cards read this projection instead of a hand-written copy:
 * `tests/render-tokens.test.ts` fails as soon as the two drift apart. Only literal hex
 * colours are projected; a token that aliases another (`ember`) is skipped.
 */
import { join } from "node:path";
import { tokens } from "@aphrody/shenron-ui/tokens";

export const GENERATED_PATH = join(import.meta.dir, "tokens.generated.ts");

const HEX = /^#[0-9a-fA-F]{6}$/;

/** `{ key: "#rrggbb" }` for every colour token that is a plain hex literal. */
export function projectColors(
  colors: Readonly<Record<string, string>> = tokens.color,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(colors)
      .filter(([, value]) => HEX.test(value))
      .map(([key, value]) => [key, value.toLowerCase()]),
  );
}

/** Text of `tokens.generated.ts` for a colour projection and the editor's ember default. */
export function renderTokensModule(
  colors: Record<string, string> = projectColors(),
  emberSiteDefault: string = tokens.ember.siteThemeDefault,
): string {
  const rows = Object.entries(colors)
    .map(([key, value]) => `  ${key}: "${value}",`)
    .join("\n");
  return `/**
 * Colours of the card renderer, generated from \`packages/ui/src/tokens.ts\`.
 *
 * Do not edit by hand: run \`bun src/render/generate-tokens.ts\`. \`--check\` and
 * \`tests/render-tokens.test.ts\` fail when this file drifts from the site tokens.
 */

/** Defaults of the \`--dbz-*\` variables (what the site renders without a saved theme). */
export const UI_COLORS = {
${rows}
} as const;

/** \`--dbz-ember\` as injected by the /admin/design editor once a theme is saved. */
export const UI_EMBER = "${emberSiteDefault.toLowerCase()}";
`;
}

/** Normalises line endings so the comparison does not depend on the checkout. */
const unix = (text: string): string => text.replace(/\r\n/g, "\n");

/** Whether the committed file equals the freshly generated one. */
export async function isUpToDate(): Promise<boolean> {
  const file = Bun.file(GENERATED_PATH);
  return (await file.exists()) && unix(await file.text()) === unix(renderTokensModule());
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    if (!(await isUpToDate())) {
      console.error("render/tokens.generated.ts is stale: run bun src/render/generate-tokens.ts");
      process.exit(1);
    }
    console.log("render/tokens.generated.ts is up to date");
  } else {
    await Bun.write(GENERATED_PATH, renderTokensModule());
    console.log(`wrote ${GENERATED_PATH}`);
  }
}
