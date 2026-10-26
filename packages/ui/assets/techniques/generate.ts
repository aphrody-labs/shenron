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
  "canon-garric": `<path fill="#fff" d="M10 73L47 34C56 12 79 9 85 24C93 42 67 53 56 53L25 86Z"/><path stroke="#111" d="M21 75L65 32M34 70L74 33"/><path d="M18 56L30 44M36 81L48 69"/>`,
  masenko: `<path fill="#fff" d="M13 71L45 34Q51 23 63 18L74 8L82 18L72 29Q69 40 58 47L25 83Z"/><path stroke="#111" d="M25 69L60 34"/><path d="M9 55L25 39M40 86L53 72M53 12L58 7M84 35L90 30"/>`,
  "beignets-galactiques": `<ellipse cx="48" cy="42" rx="35" ry="17" fill="#fff"/><ellipse cx="48" cy="42" rx="25" ry="9" fill="#111" stroke="#111"/><path d="M19 64Q48 77 77 64M27 17Q47 8 69 18"/>`,
  "kamehameha-teleporte": `<path fill="#fff" d="M47 42H55C60 26 79 25 86 39C94 56 78 72 63 64Q57 61 55 54H47Z"/><path d="M8 43H17M25 43H34M8 54H17M25 54H34M43 20L37 31M47 76L39 67M82 18L78 26"/>`,
  "super-kamehameha": `<path fill="#fff" d="M13 65Q11 46 28 31L39 29L31 42L24 54L28 65L41 72L38 81L24 76Z M83 31Q85 50 68 65L57 67L65 54L72 42L68 31L55 24L58 15L72 20Z"/><path d="M34 50Q35 34 48 33Q61 34 62 49Q61 62 48 63Q36 62 34 50Z"/>`,
  sokidan: `<circle cx="38" cy="35" r="20" fill="#fff"/><path d="M66 17Q90 44 70 69Q53 89 28 74"/><path fill="#fff" d="M33 65L17 70L28 85Z"/><path d="M13 12L19 18M8 34H13M37 7V12"/>`,
  "attaque-volley-ball": `<path fill="#fff" d="M17 70L33 65L44 69L56 67L67 49L80 47L83 60L68 78L49 83L34 78L19 82Z"/><path d="M21 26L31 34M43 15L46 31M67 16L60 32"/><circle cx="47" cy="45" r="8" fill="#fff"/>`,
  "technique-du-loup": `<path fill="#fff" d="M16 82L29 55L26 31Q26 24 31 25L36 44L39 19Q40 13 44 15L46 42L54 17Q57 12 60 16L56 44L69 25Q73 21 76 25L65 51L75 45Q82 40 84 46L73 63L55 71L46 86Z"/><path stroke="#111" d="M34 58L44 52L53 57M44 52L46 43"/>`,
  "image-remanente": `<g stroke="#777" fill="#777"><circle cx="26" cy="27" r="9"/><path d="M18 40H35L43 68L34 77L26 61L17 77L9 68Z"/></g><g stroke="#bbb" fill="#bbb"><circle cx="45" cy="27" r="9"/><path d="M37 40H54L62 68L53 77L45 61L36 77L28 68Z"/></g><g fill="#fff"><circle cx="65" cy="27" r="9"/><path d="M57 40H74L82 68L73 77L65 61L56 77L48 68Z"/></g>`,
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
