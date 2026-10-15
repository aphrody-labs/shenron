// SPDX-License-Identifier: Apache-2.0
// Live, read-only SOSH catalogue and asset availability evidence.
import { resolve, relative, isAbsolute } from "node:path";

const root = resolve(import.meta.dir, "../..");
const option = (name: string, fallback: string) => {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? fallback : (Bun.argv[index + 1] ?? fallback);
};
const origin = new URL(option("--origin", "https://dragonballfr.com")).origin;
const output = resolve(root, option("--out", "var/reports/sosh-readers/report.json"));
const reportPath = relative(resolve(root, "var/reports"), output);
if (reportPath.startsWith("..") || isAbsolute(reportPath))
  throw new Error("Evidence must remain in private var/reports");

async function json(path: string) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

const catalogue = await json("/api/manga");
const volumes = catalogue.catalog.filter((row: { series: string }) =>
  ["SOSH", "DB_SOSH"].includes(row.series),
);
type ChapterEvidence = {
  id: number;
  declaredPages: number;
  listedPages: number;
  transcribedPages: number;
  contiguous: boolean;
  unavailable: Array<{ page: number; status?: number; error?: string }>;
};
const rows: Array<{ id: number; number: number; chapters: ChapterEvidence[] }> = [];
for (const volume of volumes) {
  const detail = await json(`/api/manga/volume/${volume.id}`);
  const chapters: ChapterEvidence[] = [];
  for (const chapter of detail.chapters) {
    const content = await json(`/api/manga/chapter/${chapter.id}`);
    const images = content.pageList as Array<{ index: number; image: string; text: string | null }>;
    const unavailable: Array<{ page: number; status?: number; error?: string }> = [];
    let index = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (index < images.length) {
          const page = images[index++]!;
          try {
            const response = await fetch(page.image, {
              method: "HEAD",
              signal: AbortSignal.timeout(30000),
            });
            if (!response.ok || !response.headers.get("content-type")?.startsWith("image/"))
              unavailable.push({ page: page.index, status: response.status });
            await response.body?.cancel();
          } catch (error) {
            unavailable.push({ page: page.index, error: String(error) });
          }
        }
      }),
    );
    chapters.push({
      id: chapter.id,
      declaredPages: content.pages,
      listedPages: images.length,
      transcribedPages: images.filter((page) => page.text?.trim()).length,
      contiguous: images.every((page, position) => page.index === position + 1),
      unavailable,
    });
  }
  rows.push({ id: volume.id, number: volume.number, chapters });
}
rows.sort((a, b) => a.number - b.number);
const missingVolumes = Array.from({ length: 18 }, (_, index) => index + 1).filter(
  (number) => !rows.some((row) => row.number === number),
);
const unreadableVolumes = rows.filter((row) => !row.chapters.length).map((row) => row.number);
const report = {
  observedAt: new Date().toISOString(),
  origin,
  scope: "public-catalogue-chapter-api-and-image-head-availability",
  rendered: false,
  imageDecodingVerified: false,
  fullEditionPaginationVerified: false,
  missingVolumes,
  unreadableVolumes,
  volumes: rows,
  // HEAD and catalogue checks alone cannot prove full edition completeness.
  complete: false,
};
await Bun.write(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    output,
    volumes: rows.length,
    missingVolumes,
    unreadableVolumes,
    listedPages: rows.flatMap((row) => row.chapters).reduce((sum, row) => sum + row.listedPages, 0),
    unavailablePages: rows
      .flatMap((row) => row.chapters)
      .reduce((sum, row) => sum + row.unavailable.length, 0),
    complete: false,
  }),
);
if (
  missingVolumes.length ||
  unreadableVolumes.length ||
  rows.some((row) =>
    row.chapters.some(
      (chapter) =>
        !chapter.contiguous ||
        chapter.listedPages !== chapter.declaredPages ||
        chapter.unavailable.length,
    ),
  )
)
  process.exitCode = 1;
