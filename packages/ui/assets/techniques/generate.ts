// SPDX-License-Identifier: Apache-2.0
import { radialSpeedlines } from "../../src/toriyama-svg/geometry";
import references from "./references.json";

type ColorReference = (typeof references)[number] & {
  edition?: "DBFC";
  chapter?: number;
  chapterPage?: number;
  palette?: {
    primary: string;
    secondary: string;
    tertiary: string;
    outline: string;
    background: string;
  };
};
const colorReferences = references as ColorReference[];

const outputDirectory = import.meta.dir;
const cacheDirectory =
  Bun.env.TECHNIQUE_SOURCE_DIR ??
  `${outputDirectory}/../../../../var/reports/technique-media-20261026`;

const rayLines = (inner: number, outer: number, count: number) =>
  radialSpeedlines(48, 48, inner, outer, count)
    .map((d) => `<path d="${d}"/>`)
    .join("");

// Geometry is manually composed from the inspected source scene. It is an icon
// interpretation, not an automatic tracing or a raster embedded in SVG.
const drawings: Record<string, string> = {
  "super-fantomes-kamikazes": `<path fill="#fff" d="M20 42L16 28L29 32L30 12L43 23L49 8L56 24L71 16L67 34L79 31L74 45Q80 59 70 68Q60 76 54 74Q41 71 38 84Q24 74 30 63Q17 58 20 42Z"/><path stroke="#111" d="M29 43L40 47M63 43L52 47M37 56Q48 66 61 54M39 36L46 29L53 36"/>`,
  "explosion-finale": `<path fill="#fff" d="M47 7L57 28L73 13L70 38L88 31L78 53L89 66L68 71L69 87L49 78L29 89L29 73L9 65L20 51L9 32L29 37L24 13L41 29Z"/><circle cx="49" cy="45" r="6" fill="#111" stroke="#111"/><path stroke="#111" d="M49 52V66M49 57L35 51M49 57L63 51M49 66L39 77M49 66L60 77"/>`,
  "grenade-infernale": `<g fill="#fff"><circle cx="18" cy="24" r="9"/><circle cx="48" cy="13" r="6"/><circle cx="78" cy="24" r="9"/><circle cx="13" cy="55" r="6"/><circle cx="83" cy="55" r="6"/><circle cx="29" cy="80" r="9"/><circle cx="67" cy="80" r="9"/></g><path d="M35 43L48 34L61 43L57 61H39Z"/><path d="M28 34L35 39M68 34L61 39M29 66L35 61M67 66L61 61"/>`,
  "kamehameha-pere-fils": `<path fill="#fff" d="M8 55L38 49Q42 29 61 29Q80 28 87 47Q93 67 75 77Q58 88 44 72L8 81Z"/><path d="M18 18L29 25L40 23M29 25L31 34M46 11L57 18L68 16M57 18L59 25"/><path stroke="#111" d="M22 64L60 55M30 70L69 59"/>`,
  "boule-de-la-mort": `<path fill="#fff" d="M48 11L53 16L63 16L66 23L74 28L72 37L75 45L67 51L61 59L52 57L44 62L37 56L27 55L25 47L19 40L24 33L23 23L33 20L39 13Z"/><circle cx="47" cy="36" r="16" fill="#111" stroke="#111"/><path fill="#fff" d="M41 88V81L45 77V73Q45 70 49 70Q53 70 53 73V78L61 81L63 88Z"/>`,
  "super-vegeta": `<path fill="#fff" d="M25 47L12 30L29 34L23 12L41 22L48 7L55 22L74 12L67 34L84 30L71 47L63 42L56 39L48 48L40 39L33 42Z"/><path d="M27 49L30 66L48 79L66 66L69 49M36 54L42 57M60 54L54 57M42 67H54"/><path d="M17 82L31 73M79 82L65 73"/>`,
  "super-saiyen": `<path fill="#fff" d="M22 48L9 34L26 35L17 17L36 24L40 8L52 22L65 10L67 28L84 24L74 42L84 44L65 52L57 38L45 48L38 35L31 48Z"/><path d="M29 52L32 69L48 79L64 69L67 53M35 57L43 59M61 57L53 59M43 68H53"/>`,
  "super-saiyen-2": `<path fill="#fff" d="M24 48L12 36L28 34L22 15L39 24L48 7L57 26L74 12L70 35L85 30L73 49L62 44L53 35L46 49L36 39L31 50Z"/><path d="M31 53L34 70L48 79L62 70L65 53M38 58L44 60M58 58L52 60"/><path d="M12 54L7 67L16 65L11 82M82 52L89 64L81 64L86 82"/>`,
  "super-saiyen-3": `<path fill="#fff" d="M30 41L18 31L28 27L24 15L39 23L48 7L57 23L73 15L68 29L79 35L70 43L79 58L72 59L82 76L69 73L74 87L58 77L48 87L38 77L23 87L27 73L15 77L24 58L17 55Z"/><path fill="#111" stroke="#111" d="M34 40L40 35L48 43L56 35L63 40L61 60L48 70L35 60Z"/><path d="M39 47L44 49M57 47L52 49M44 60H52"/>`,
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
  "baton-magique": `<path fill="#fff" stroke="#111" stroke-width="3" d="M13 76L24 81L84 20L77 13Z"/><path d="M18 68L29 76M72 25L79 32"/>`,
  "rayon-oculaire": `<path fill="#fff" d="M20 48Q48 20 76 48Q48 76 20 48Z"/><circle cx="48" cy="48" r="12" fill="#111"/><path d="M48 8V22M48 74V88M8 48H21M75 48H88M19 19L29 29M67 67L77 77"/>`,
  "echange-des-corps": `<circle cx="31" cy="34" r="13" fill="#fff"/><circle cx="65" cy="62" r="13" fill="#fff"/><path d="M25 49L20 76L34 69L42 80L47 56M71 47L76 20L62 27L54 16L49 40"/><path stroke="#111" stroke-width="4" d="M40 42L56 54M53 40L57 54L43 52"/>`,
  "super-genkidama": `<circle cx="48" cy="43" r="27" fill="#fff"/><path d="M48 4V12M48 74V84M9 43H17M79 43H87M20 15L27 22M69 64L76 71M76 15L69 22M27 64L20 71"/><path d="M28 84L37 70H59L69 84M37 70L40 60M59 70L56 60"/>`,
  "kaioken-kamehameha-x4": `<path fill="#fff" d="M10 42H56L67 30L87 45L94 49L87 53L67 67L56 54H10Z"/><path d="M17 34L38 39M17 64L38 59M46 27L52 37M46 70L52 61"/>`,
  "kaioken-kamehameha-x20": `<path fill="#fff" d="M8 39H54L67 22L86 43L94 48L86 54L67 75L54 57H8Z"/><path stroke="#111" stroke-width="4" d="M17 48H78"/><path d="M22 30L39 39M22 67L39 57M48 22L55 34M48 74L55 61"/>`,
  autodestruction: `<circle cx="48" cy="48" r="11" fill="#fff"/><path d="M48 5L54 29L73 13L65 35L91 31L71 47L91 62L66 60L76 84L55 67L46 92L40 67L18 83L29 59L5 54L28 44L10 25L35 31L34 7L47 29Z"/>`,
  geant: `<path fill="#fff" d="M26 82L30 51L21 42L27 28L35 17L41 27L47 13L53 27L62 17L68 30L75 39L66 51L70 82L56 78L48 86L39 78Z"/><path stroke="#111" d="M34 43L43 46M62 43L53 46M42 59H55"/>`,
  "dynamite-kick": `<path fill="#fff" d="M18 74L37 57L47 42L61 47L76 38L87 42L78 55L60 66L45 68L31 83Z"/><path d="M53 43L61 24L69 17L70 35M62 47L77 24L85 20L82 41M42 52L32 36L22 31M17 20L20 28M9 32L16 34M83 68L91 70"/>`,
};

for (const reference of colorReferences) {
  if (
    reference.edition !== "DBFC" ||
    !Number.isSafeInteger(reference.chapter) ||
    !Number.isSafeInteger(reference.chapterPage) ||
    !reference.palette ||
    Object.values(reference.palette).some((color) => !/^#[0-9a-f]{6}$/i.test(color))
  )
    throw new Error(`A verified color-manga source and palette are required: ${reference.slug}`);
  const chapter = reference.chapter!;
  const chapterPage = reference.chapterPage!;
  const readerUrl = new URL(reference.sourceUrl);
  const imageUrl = new URL(reference.imageUrl);
  if (
    readerUrl.origin !== "https://dragonballfr.com" ||
    readerUrl.pathname !== `/wiki/manga/${20000 + chapter}` ||
    readerUrl.searchParams.get("page") !== String(chapterPage) ||
    imageUrl.origin !== "https://cdn.dragonballfr.com" ||
    imageUrl.pathname !==
      `/assets/manga/DBFC/ch${chapter}/${String(chapterPage).padStart(3, "0")}.jpg`
  )
    throw new Error(`Reader and source image disagree: ${reference.slug}`);
  const sourcePath = `${cacheDirectory}/DBFC-ch${chapter}-${String(chapterPage).padStart(3, "0")}.jpg`;
  if (!(await Bun.file(sourcePath).exists())) {
    const response = await fetch(reference.imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${reference.slug}`);
    await Bun.write(sourcePath, response);
  }
  const bytes = await Bun.file(sourcePath).bytes();
  const digest = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (digest !== reference.sha256) throw new Error(`Source changed: ${reference.slug}`);
  const metadata = await new Bun.Image(bytes).metadata();
  if (metadata.width !== reference.width || metadata.height !== reference.height)
    throw new Error(`Source dimensions changed: ${reference.slug}`);
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
  const coloredDrawing = drawing
    .replaceAll("#fff", reference.palette.primary)
    .replaceAll("#111", reference.palette.outline)
    .replaceAll("#777", reference.palette.secondary)
    .replaceAll("#bbb", reference.palette.tertiary);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><metadata>Primary reference: ${reference.sourceUrl}; DBFC color-manga palette; manual icon interpretation; source SHA-256 ${reference.sha256}</metadata><rect width="96" height="96" rx="14" fill="${reference.palette.background}"/><g fill="none" stroke="${reference.palette.secondary}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${coloredDrawing}</g></svg>\n`;
  await Bun.write(`${outputDirectory}/${reference.slug}.svg`, svg);
  console.log(reference.slug);
}
