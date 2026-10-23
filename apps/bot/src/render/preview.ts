/**
 * Renders every sample card to a folder, with synthetic avatars (no network), to look at
 * the cards or to compare them after a change:
 *
 *   bun src/render/preview.ts [outDir]
 *
 * `outDir` defaults to a new folder in the system temp directory. Prints one line per card.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleCards, syntheticImages } from "./fixtures";

const outDir = process.argv[2] ?? mkdtempSync(join(tmpdir(), "shenron-cards-"));
const images = syntheticImages();
for (const card of sampleCards()) {
  const rendered = await card.render({ images });
  const file = join(outDir, `${card.name}.${rendered.extension}`);
  await Bun.write(file, rendered.buffer);
  console.log(
    `${card.name.padEnd(20)} ${rendered.width}x${rendered.height} ${rendered.format} ` +
      `${(rendered.bytes / 1024).toFixed(0)} KiB ${rendered.elapsedMs.toFixed(0)} ms -> ${file}`,
  );
}
