// SPDX-License-Identifier: Apache-2.0
import { radialSpeedlines } from "../../src/toriyama-svg/geometry";
import references from "./references.json";

const outputDirectory = import.meta.dir;
const cacheDirectory =
  Bun.env.TECHNIQUE_SOURCE_DIR ??
  `${outputDirectory}/../../../../var/reports/technique-media-20261026`;

const rayLines = (inner: number, outer: number, count: number) =>
  radialSpeedlines(48, 48, inner, outer, count)
    .map((d) => `<path d="${d}"/>`)
    .join("");

// Geometry is manually composed from the inspected, monochrome source scene.
// It is an icon interpretation, not an automatic tracing or a raster embedded in SVG.
const drawings: Record<string, string> = {
  kikoho: `<path fill="#fff" d="M10 52L35 15L48 11L61 15L86 52L72 79L48 68L24 79Z"/><path fill="#111" stroke="#111" d="M28 47L48 25L68 47L48 63Z"/><path stroke="#111" d="M20 52L34 31M76 52L62 31"/>`,
  mafuba: `<path d="M12 47C12 24 72 13 83 35C93 53 56 61 31 56C14 52 17 37 39 33C61 29 76 42 64 49C54 56 37 48 41 42C43 38 54 38 55 42"/><path fill="#fff" d="M15 60Q48 78 80 60L58 84L38 84Z"/><path d="M39 89H57"/>`,
  dodompa: `<path fill="#fff" d="M8 47H51L63 36L82 43L89 48L81 53L63 59L51 50H8Z"/><path d="M12 37H40M12 60H40M66 23V31M83 31L78 36M82 64L78 59M66 65V73"/>`,
  kaioken: `<path fill="#fff" d="M48 9L58 30L71 20L68 40L83 34L77 54L85 68L69 80L48 88L27 80L11 68L19 54L13 34L28 40L25 20L38 30Z"/><path fill="#111" stroke="#111" d="M48 31L61 49L62 69L48 77L34 69L35 49Z"/><path stroke="#fff" d="M42 55L48 49L54 55M48 50V68"/>`,
  teleportation: `<path fill="#fff" d="M35 81V58L28 49Q23 43 28 39Q31 36 36 41L40 46V19Q40 13 45 13Q50 13 50 19V39L54 20Q55 15 60 16Q64 17 63 23L60 46L67 48Q75 52 72 63L66 81Z"/><path stroke="#111" d="M48 50L59 51M47 57L60 59"/><path d="M12 25H28M7 35H22M13 68H24M73 25H86M77 38H89M79 70H88"/>`,
  kamehameha: `<path fill="#fff" d="M8 40L47 40C53 20 78 19 86 36C96 58 75 78 56 67C51 64 48 59 47 56L8 56Z"/><path d="M12 32L31 32M12 64L30 64M23 23L38 29M24 73L39 67"/>`,
  genkidama: `<circle cx="48" cy="48" r="22" fill="#fff"/>${rayLines(29, 42, 12)}`,
  kienzan: `<ellipse cx="48" cy="48" rx="38" ry="7.3" fill="#fff"/><path d="M17 37Q48 25 78 37M18 60Q48 71 77 60M6 45L13 42M82 54L90 51"/>`,
  makankosappo: `<path fill="#fff" d="M13 69L70 18Q77 12 83 17Q88 22 81 29L23 78Z"/><g stroke="#111" stroke-width="5"><path d="M20 58C7 43 31 33 43 45S57 56 49 64M38 40C28 24 50 16 62 28S75 40 68 46M58 23C55 10 75 7 82 18"/></g><g stroke="#fff" stroke-width="2.5"><path d="M20 58C7 43 31 33 43 45S57 56 49 64M38 40C28 24 50 16 62 28S75 40 68 46M58 23C55 10 75 7 82 18"/></g>`,
  "final-flash": `<path fill="#fff" d="M9 66L20 43L29 46L40 28L48 35L62 15L69 26L86 11L76 35L85 39L74 49L82 58L63 61L59 72L38 68L32 79Z"/><path stroke="#111" d="M21 65L67 30M30 67L73 42M33 55L60 34"/>`,
  "shin-kikoho": `<path fill="#fff" d="M15 72L38 20L48 11L58 20L81 72L64 80L48 66L32 80Z"/><path fill="#111" stroke="#111" d="M34 59L48 32L62 59L48 68Z"/><path stroke="#111" d="M24 67L39 35M72 67L57 35"/>`,
  "morsure-du-soleil": `${rayLines(23, 44, 20)}<path fill="#fff" d="M34 46Q31 19 48 19Q65 19 62 46L55 60L48 65L41 60Z"/><path stroke="#111" d="M39 43L45 46M57 43L51 46M45 34Q48 31 51 34"/><path d="M14 52L32 40M14 42L31 38M82 52L64 40M82 42L65 38"/>`,
  "big-bang": `<path fill="#fff" d="M9 70L40 42C37 25 51 15 65 19C81 23 85 41 74 53C67 61 57 62 49 56Z"/><path d="M16 55L31 40M26 73L42 59M65 11L67 5M84 27L90 23"/>`,
};

for (const reference of references) {
  const sourcePath = `${cacheDirectory}/vol${reference.volume}-${reference.page}.webp`;
  if (!(await Bun.file(sourcePath).exists())) {
    const response = await fetch(reference.imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${reference.slug}`);
    await Bun.write(sourcePath, response);
  }
  const bytes = await Bun.file(sourcePath).bytes();
  const digest = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (digest !== reference.sha256) throw new Error(`Source changed: ${reference.slug}`);
  const [left, top, width, height] = reference.crop;
  // The qualified runtime exposes extract; the pinned declaration package predates it.
  const image = new Bun.Image(bytes) as Bun.Image & {
    extract(rectangle: { left: number; top: number; width: number; height: number }): Bun.Image;
  };
  await image
    .extract({ left, top, width, height })
    .resize(Math.min(width, 768), Math.round((height * Math.min(width, 768)) / width))
    .webp({ quality: 88 })
    .write(`${outputDirectory}/${reference.slug}.webp`);
  const drawing = drawings[reference.slug];
  if (!drawing) throw new Error(`Missing icon: ${reference.slug}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><metadata>Primary reference: ${reference.sourceUrl}; manual icon interpretation; source SHA-256 ${reference.sha256}</metadata><rect width="96" height="96" rx="14" fill="#111"/><g fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${drawing}</g></svg>\n`;
  await Bun.write(`${outputDirectory}/${reference.slug}.svg`, svg);
  console.log(reference.slug);
}
