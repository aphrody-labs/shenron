// SPDX-License-Identifier: Apache-2.0
/** Read-only inspection of legacy Markdown derivatives; canonical replication owns all SQLite writes. */
import { readdirSync, readFileSync } from "node:fs";
import type { NewDbMangaPage } from "../src/db/schema";

const args = Bun.argv.slice(2);
if (args.length !== 1 || args[0] !== "--dry-run")
  throw new Error(
    "Legacy manga ingest writes are disabled; use --dry-run explicitly or the canonical --replica-sync --manga-search owner",
  );

const ROOT = new URL("..", import.meta.url).pathname; // apps/bot/
const TDIR = `${ROOT}assets/manga/transcripts`;

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function seriesTome(file: string): { series: string; tome: string } {
  const base = file.replace(/\.md$/, "");
  const series = base.split("-")[0];
  const tome = base.split("-").slice(1).join("-");
  return { series, tome };
}

/** Nettoyage léger d'une bulle OCR : garde le JP (kanji/kana isolé = mot), drop le bruit pur. */
function cleanLine(l: string): string | null {
  const t = l
    .replace(/^[-*]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  if (CJK.test(t)) return t;
  const alnum = (t.match(/[\p{L}\p{N}]/gu) || []).length;
  if (alnum < 2) return null;
  return t;
}

/** Langue dominante de la planche : "ja" si massivement CJK, sinon "fr". */
function detectLang(text: string): string {
  const cjk = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  const latin = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  return cjk > 8 && cjk >= latin ? "ja" : "fr";
}

const files = readdirSync(TDIR)
  .filter((f) => f.endsWith(".md"))
  .toSorted();

const rows: NewDbMangaPage[] = [];
for (const file of files) {
  const { series, tome } = seriesTome(file);
  const raw = readFileSync(`${TDIR}/${file}`, "utf-8");
  const parts = raw.split(/\n##\s+Planche\s+(\d+)\s*\n/);
  for (let i = 1; i < parts.length; i += 2) {
    const planche = Number(parts[i]);
    const body = parts[i + 1] ?? "";
    const lines = body
      .split("\n")
      .map(cleanLine)
      .filter((x): x is string => x !== null);
    if (!lines.length) continue;
    const text = lines.join(" ");
    rows.push({
      series,
      tome,
      planche,
      lines,
      text,
      lang: detectLang(text),
      hasJa: CJK.test(text),
      lineCount: lines.length,
      charCount: text.length,
    });
  }
}

console.log(
  JSON.stringify({
    mode: "dry-run",
    pages: rows.length,
    volumes: new Set(rows.map((row) => `${row.series}/${row.tome}`)).size,
    writesDisabled: true,
    authoritativeSource: "PostgreSQL published manga snapshot",
    owner: "shenron-bot --replica-sync --manga-search",
  }),
);
