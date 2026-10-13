// SPDX-License-Identifier: Apache-2.0
import { frameSchemeCss } from "../../apps/site/src/lib/frame-theme";

const root = new URL("../../", import.meta.url);
const reference = await Bun.file(
  new URL("apps/site/src/lib/frame-theme-reference.json", root),
).json();
const theme = reference.themes.find(
  (entry: { frameNumber: number }) => entry.frameNumber === reference.defaultFrameNumber,
);
if (!theme || theme.dark !== true || theme.variant !== "fidelity")
  throw new Error("A complete qualified dark frame scheme is required");
const file = Bun.file(new URL("apps/site/src/app/frame-theme.css", root));
const current = await file.text();
const marker = "/* Qualified episode frame defaults. */";
const body = current.split(marker)[0]!.trimEnd();
const next = `${body}\n\n${marker}\n/* Episode ${reference.episodeId}, frame ${theme.frameNumber}; source SHA256 ${reference.sourceSha256}. */\n:root {\n${frameSchemeCss(theme.roles)}\n}\n`;
if (Bun.argv.includes("--check")) {
  if (current !== next) throw new Error("The shared frame theme projection is stale");
} else await Bun.write(file, next);
