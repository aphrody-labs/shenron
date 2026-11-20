// SPDX-License-Identifier: Apache-2.0
/**
 * Snapshots the Material 3 token values of a Compose Material 3 release into
 * `src/compose-m3.generated.ts`, so the CSS tokens follow the shipped library instead of a hand copy.
 *
 *   bun packages/m3-tokens/scripts/sync-compose-m3.ts            write the snapshot
 *   bun packages/m3-tokens/scripts/sync-compose-m3.ts --check    exit 1 when the snapshot is stale
 *
 * Source: the `material3-<version>-sources.jar` of Google Maven (androidx.compose.material3), the
 * files `tokens/{Standard,Expressive}MotionTokens.kt`, `tokens/ShapeTokens.kt` and
 * `tokens/TypeScaleTokens.kt`. Version: Compose Material 3 1.5.0, stable on 2026-11-18
 * (https://m3.material.io/blog/compose-material-3-is-stable).
 */
import { inflateRawSync } from "node:zlib";
import { join } from "node:path";
import { themeDir } from "../../../scripts/build/wiki-artifacts";

export const COMPOSE_MATERIAL3_VERSION = "1.5.0";
const JAR = `https://dl.google.com/android/maven2/androidx/compose/material3/material3/${COMPOSE_MATERIAL3_VERSION}/material3-${COMPOSE_MATERIAL3_VERSION}-sources.jar`;
const OUT = join(import.meta.dir, "..", "src", "compose-m3.generated.ts");
/**
 * The springs for the native GPUI theme (`crates/shenron-theme` in aphrody-labs/wiki), from the same
 * snapshot: `$SHENRON_THEME_DIR` or the sibling wiki checkout (scripts/build/wiki-artifacts.ts); skipped without one.
 */
const THEME_DIR = themeDir();
const SPRINGS_OUT = THEME_DIR && join(THEME_DIR, "compose-m3-springs.json");
const WANTED = [
  "StandardMotionTokens.kt",
  "ExpressiveMotionTokens.kt",
  "ShapeTokens.kt",
  "TypeScaleTokens.kt",
];

/** The entries of a zip archive whose base name is wanted, read from its central directory. */
function readZip(archive: Uint8Array, wanted: readonly string[]): Map<string, string> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let end = archive.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip archive");
  const count = view.getUint16(end + 10, true);
  let entry = view.getUint32(end + 16, true);
  const files = new Map<string, string>();
  for (let index = 0; index < count; index++) {
    const method = view.getUint16(entry + 10, true);
    const compressed = view.getUint32(entry + 20, true);
    const nameLength = view.getUint16(entry + 28, true);
    const extraLength = view.getUint16(entry + 30, true);
    const commentLength = view.getUint16(entry + 32, true);
    const local = view.getUint32(entry + 42, true);
    const name = new TextDecoder().decode(archive.subarray(entry + 46, entry + 46 + nameLength));
    const base = name.slice(name.lastIndexOf("/") + 1);
    if (name.includes("/tokens/") && wanted.includes(base) && !files.has(base)) {
      const start =
        local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = archive.subarray(start, start + compressed);
      const bytes = method === 0 ? data : method === 8 ? inflateRawSync(data) : null;
      if (!bytes) throw new Error(`${name}: unsupported compression ${method}`);
      files.set(base, new TextDecoder().decode(bytes));
    }
    entry += 46 + nameLength + extraLength + commentLength;
  }
  for (const name of wanted) if (!files.has(name)) throw new Error(`${name} missing from ${JAR}`);
  return files;
}

function springs(source: string): Record<string, { damping: number; stiffness: number }> {
  const values = new Map(
    [...source.matchAll(/const val Spring(\w+?)(Damping|Stiffness) = ([0-9.]+)f/g)].map((m) => [
      `${m[1]}${m[2]}`,
      Number(m[3]),
    ]),
  );
  const out: Record<string, { damping: number; stiffness: number }> = {};
  for (const speed of ["Fast", "Default", "Slow"]) {
    for (const kind of ["Spatial", "Effects"]) {
      const damping = values.get(`${speed}${kind}Damping`);
      const stiffness = values.get(`${speed}${kind}Stiffness`);
      if (damping === undefined || stiffness === undefined)
        throw new Error(`spring ${speed}${kind} missing`);
      out[`${speed.toLowerCase()}-${kind.toLowerCase()}`] = { damping, stiffness };
    }
  }
  return out;
}

const kebab = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

function corners(source: string): Record<string, number> {
  const out: Record<string, number> = { none: 0 };
  for (const m of source.matchAll(/val Corner(\w+) = RoundedCornerShape\(([0-9.]+)\.dp\)/g))
    out[kebab(m[1]!)] = Number(m[2]);
  if (!("extra-small" in out && "extra-extra-large" in out))
    throw new Error("corner scale incomplete");
  return out;
}

const WEIGHTS: Record<string, number> = { WeightRegular: 400, WeightMedium: 500, WeightBold: 700 };

function typeScale(
  source: string,
): Record<string, { size: number; lineHeight: number; tracking: number; weight: number }> {
  const values = new Map<string, string>();
  for (const m of source.matchAll(/val (\w+): [\w.]+\s+get\(\) = ([^\n]+)/g))
    values.set(m[1]!, m[2]!.trim());
  const sp = (value: string | undefined, key: string) => {
    const m = value?.match(/^(-?[0-9.]+)\.sp$/);
    if (!m) throw new Error(`${key}: ${value}`);
    return Number(m[1]);
  };
  const out: Record<
    string,
    { size: number; lineHeight: number; tracking: number; weight: number }
  > = {};
  for (const key of values.keys()) {
    const m = key.match(/^(\w+?)Size$/);
    if (!m) continue;
    const style = m[1]!;
    const weight = WEIGHTS[values.get(`${style}Weight`)?.replace("TypefaceTokens.", "") ?? ""];
    if (weight === undefined) throw new Error(`${style}Weight: ${values.get(`${style}Weight`)}`);
    out[kebab(style)] = {
      size: sp(values.get(`${style}Size`), `${style}Size`),
      lineHeight: sp(values.get(`${style}LineHeight`), `${style}LineHeight`),
      tracking: sp(values.get(`${style}Tracking`), `${style}Tracking`),
      weight,
    };
  }
  return out;
}

export async function snapshot(): Promise<{ ts: string; springs: string }> {
  const response = await fetch(JAR);
  if (!response.ok) throw new Error(`${JAR}: ${response.status}`);
  const files = readZip(new Uint8Array(await response.arrayBuffer()), WANTED);
  const data = {
    standardSprings: springs(files.get("StandardMotionTokens.kt")!),
    expressiveSprings: springs(files.get("ExpressiveMotionTokens.kt")!),
    cornersDp: corners(files.get("ShapeTokens.kt")!),
    typeScaleSp: typeScale(files.get("TypeScaleTokens.kt")!),
  };
  const springsJson = `${JSON.stringify({ version: COMPOSE_MATERIAL3_VERSION, standard: data.standardSprings, expressive: data.expressiveSprings }, null, 2)}\n`;
  const ts = [
    "// SPDX-License-Identifier: Apache-2.0",
    `// Generated by packages/m3-tokens/scripts/sync-compose-m3.ts from Compose Material 3 ${COMPOSE_MATERIAL3_VERSION}`,
    "// (Google Maven sources jar, tokens/*.kt); do not edit.",
    `export const COMPOSE_MATERIAL3_VERSION = ${JSON.stringify(COMPOSE_MATERIAL3_VERSION)};`,
    `export const COMPOSE_M3 = ${JSON.stringify(data, null, 2)} as const;`,
    "",
  ].join("\n");
  return { ts, springs: springsJson };
}

if (import.meta.main) {
  const next = await snapshot();
  const outputs: [string, string][] = [
    [OUT, next.ts],
    ...(SPRINGS_OUT ? ([[SPRINGS_OUT, next.springs]] as [string, string][]) : []),
  ];
  if (!SPRINGS_OUT)
    console.log(
      "no wiki checkout (SHENRON_THEME_DIR, SHENRON_WIKI_DIR): springs for the GPUI theme skipped",
    );
  if (process.argv.includes("--check")) {
    let stale = false;
    for (const [path, content] of outputs) {
      if (
        (await Bun.file(path)
          .text()
          .catch(() => "")) !== content
      ) {
        console.error(`${path} is stale: run bun packages/m3-tokens/scripts/sync-compose-m3.ts`);
        stale = true;
      }
    }
    if (stale) process.exit(1);
    console.log(`compose-m3 snapshot current (${COMPOSE_MATERIAL3_VERSION})`);
  } else {
    for (const [path, content] of outputs) await Bun.write(path, content);
    console.log(`wrote ${outputs.map(([path]) => path).join(", ")}`);
  }
}
