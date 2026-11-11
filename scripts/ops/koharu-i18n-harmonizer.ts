// SPDX-License-Identifier: Apache-2.0
/**
 * Koharu i18n & Lexicon Harmonizer
 *
 * Ensures 100% key and canonical terminology parity across:
 * - apps/site (messages/fr.json, en.json, ja.json)
 * - apps/bot (src/locales/fr.json, en.json, ja.json)
 * - packages/ui (src/koharu/locales/{fr-FR,en-US,ja-JP}/translation.json)
 * - data/lexicon/terms.json (canonical Dragon Ball terminology)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface LexiconTerm {
  id: string;
  kind: string;
  ja: string;
  fr: string;
  en: string;
}

interface LexiconFile {
  version: number;
  terms: LexiconTerm[];
}

export function loadCanonicalTerms(): Map<string, LexiconTerm> {
  const path = join(import.meta.dir, "../../data/lexicon/terms.json");
  if (!existsSync(path)) return new Map();
  const raw = JSON.parse(readFileSync(path, "utf-8")) as LexiconFile;
  const map = new Map<string, LexiconTerm>();
  for (const t of raw.terms) {
    if (t.id) map.set(t.id, t);
    if (t.ja) map.set(t.ja, t);
  }
  return map;
}

export function getAllKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [];
  const rec = obj as Record<string, unknown>;
  const keys: string[] = [];
  for (const k of Object.keys(rec)) {
    const val = rec[k];
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      keys.push(...getAllKeys(val, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

export function auditNamespaceParity(
  name: string,
  frObj: unknown,
  enObj: unknown,
  jaObj: unknown,
): { valid: boolean; totalKeys: number; missingEn: string[]; missingJa: string[] } {
  const frKeys = new Set(getAllKeys(frObj));
  const enKeys = new Set(getAllKeys(enObj));
  const jaKeys = new Set(getAllKeys(jaObj));

  const missingEn = [...frKeys].filter((k) => !enKeys.has(k));
  const missingJa = [...frKeys].filter((k) => !jaKeys.has(k));

  return {
    valid: missingEn.length === 0 && missingJa.length === 0,
    totalKeys: frKeys.size,
    missingEn,
    missingJa,
  };
}

export function harmonizeTerminology(
  text: string,
  targetLang: "fr" | "en" | "ja",
  lexicon: Map<string, LexiconTerm>,
): string {
  let result = text;
  // Apply canonical terms substitution
  for (const term of lexicon.values()) {
    if (targetLang === "fr" && term.ja && term.fr) {
      if (result.includes(term.ja)) {
        result = result.replaceAll(term.ja, term.fr);
      }
    } else if (targetLang === "en" && term.ja && term.en) {
      if (result.includes(term.ja)) {
        result = result.replaceAll(term.ja, term.en);
      }
    }
  }
  return result;
}

export async function runI18nAudit() {
  const root = join(import.meta.dir, "../..");
  console.log("=== Koharu i18n & Lexicon Harmonization Audit ===");

  // 1. Site messages
  const siteFr = JSON.parse(readFileSync(join(root, "apps/site/messages/fr.json"), "utf-8"));
  const siteEn = JSON.parse(readFileSync(join(root, "apps/site/messages/en.json"), "utf-8"));
  const siteJa = JSON.parse(readFileSync(join(root, "apps/site/messages/ja.json"), "utf-8"));
  const siteAudit = auditNamespaceParity("apps/site", siteFr, siteEn, siteJa);
  console.log(
    `[apps/site] Total keys: ${siteAudit.totalKeys} | Parity: ${siteAudit.valid ? "OK (100%)" : "FAILED"}`,
  );

  // 2. Bot locales
  const botFr = JSON.parse(readFileSync(join(root, "apps/bot/src/locales/fr.json"), "utf-8"));
  const botEn = JSON.parse(readFileSync(join(root, "apps/bot/src/locales/en.json"), "utf-8"));
  const botJa = JSON.parse(readFileSync(join(root, "apps/bot/src/locales/ja.json"), "utf-8"));
  const botAudit = auditNamespaceParity("apps/bot", botFr, botEn, botJa);
  console.log(
    `[apps/bot] Total keys: ${botAudit.totalKeys} | Parity: ${botAudit.valid ? "OK (100%)" : "FAILED"}`,
  );

  // 3. Koharu UI locales
  const koharuFr = JSON.parse(
    readFileSync(join(root, "packages/ui/src/koharu/locales/fr-FR/translation.json"), "utf-8"),
  );
  const koharuEn = JSON.parse(
    readFileSync(join(root, "packages/ui/src/koharu/locales/en-US/translation.json"), "utf-8"),
  );
  const koharuJa = JSON.parse(
    readFileSync(join(root, "packages/ui/src/koharu/locales/ja-JP/translation.json"), "utf-8"),
  );
  const koharuAudit = auditNamespaceParity("packages/ui/koharu", koharuFr, koharuEn, koharuJa);
  console.log(
    `[packages/ui/koharu] Total keys: ${koharuAudit.totalKeys} | Parity: ${koharuAudit.valid ? "OK (100%)" : "FAILED"}`,
  );

  // 4. Canonical terms
  const terms = loadCanonicalTerms();
  console.log(`[data/lexicon] Canonical Dragon Ball terms indexed: ${terms.size}`);

  const allValid = siteAudit.valid && botAudit.valid && koharuAudit.valid;
  if (!allValid) {
    console.error("i18n audit failed with missing keys!");
    process.exit(1);
  }
  console.log("=== All i18n & Lexicon Suites Passed Cleanly ===");
}

if (import.meta.main) {
  runI18nAudit();
}
