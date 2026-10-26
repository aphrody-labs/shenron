#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Read-only discovery over real source snapshots, preserving native page/image addresses. */
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import {
  discoverTechniqueImages,
  techniqueDocumentsFromNativeWiki,
  techniqueDocumentsFromNativeCrawl,
  techniqueDocumentsFromNativeMarkdown,
  type TechniqueImageDocument,
  type TechniqueImageIdentity,
} from "../../../packages/pipeline/src/dragon-ball/technique-images";
import {
  TECHNIQUES,
  TECHNIQUE_IMAGE_SEARCH_ALIASES,
  normalizeForQuote,
  toHepburn,
} from "./_technique-lexicon";

function option(name: string) {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

async function main() {
  const snapshotPath = option("--snapshot");
  const nativePath = option("--native");
  const cataloguePath = option("--catalogue");
  const output = option("--out");
  if (!output || (!snapshotPath && !nativePath))
    throw new Error(
      "Usage: bun discover-technique-images.ts --snapshot <public-snapshot.sqlite> [--native <native-dossiers.json>] [--catalogue <catalogue.json> | --live-catalogue] --out <report.json>",
    );
  let catalogue: { rows: Array<TechniqueImageIdentity & { nameJa?: string; nameRomaji?: string }> };
  if (Bun.argv.includes("--live-catalogue")) {
    const token = await Bun.secrets.get({ service: "shenron-mcp", name: "owner-admin" });
    if (!token) throw new Error("Authorized admin credential is unavailable");
    catalogue = { rows: [] };
    let expectedTotal = 1;
    while (catalogue.rows.length < expectedTotal) {
      const response = await fetch(
        `https://dragonballfr.com/api/wiki-admin/db_techniques?limit=200&offset=${catalogue.rows.length}`,
        {
          headers: { authorization: `Bearer ${token}` },
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok) throw new Error(`Catalogue read failed: HTTP ${response.status}`);
      const page = (await response.json()) as typeof catalogue & { total: number };
      if (
        !Number.isSafeInteger(page.total) ||
        !Array.isArray(page.rows) ||
        !page.rows.length ||
        page.total > 10000
      )
        throw new Error("Catalogue pagination is incomplete or malformed");
      if (catalogue.rows.length > 0 && page.total !== expectedTotal)
        throw new Error("Catalogue count changed during discovery");
      expectedTotal = page.total;
      catalogue.rows.push(...page.rows);
    }
  } else {
    if (!cataloguePath) throw new Error("An explicit catalogue or --live-catalogue is required");
    catalogue = await Bun.file(cataloguePath).json();
  }
  if (
    !Array.isArray(catalogue.rows) ||
    !catalogue.rows.every(
      (row) =>
        Number.isSafeInteger(row.id) &&
        row.id > 0 &&
        typeof row.slug === "string" &&
        typeof row.name === "string",
    )
  )
    throw new Error("Invalid technique catalogue");
  const techniques = catalogue.rows.map((row) => {
    const lexicon = TECHNIQUES.find((entry) => entry.id === row.id && entry.name === row.name);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      visible: row.visible,
      debutChapterId: row.debutChapterId,
      aliases: [
        row.nameJa,
        row.nameRomaji,
        lexicon?.ja,
        lexicon?.reading,
        lexicon?.reading ? toHepburn(lexicon.reading) : undefined,
      ].filter((alias): alias is string => typeof alias === "string" && alias.length > 0),
    };
  });
  const documents: TechniqueImageDocument[] = [];
  const nativeTextSources = new Map<string, string>();
  if (snapshotPath) {
    using snapshot = new Database(snapshotPath, { readonly: true });
    const pages = snapshot
      .query(
        "SELECT chapter_id,page_index,image,text,payload_json FROM manga_chapter_pages WHERE image IS NOT NULL",
      )
      .all() as Array<{
      chapter_id: number;
      page_index: number;
      image: string;
      text: string | null;
      payload_json: string;
    }>;
    for (const page of pages) {
      const payload = JSON.parse(page.payload_json) as { href?: string };
      if (!payload.href) continue;
      documents.push({
        sourceUrl: payload.href,
        medium: "manga",
        chapterId: page.chapter_id,
        locator: `chapter:${page.chapter_id};page:${page.page_index}`,
        text: page.text ?? "",
        images: [{ url: page.image }],
      });
    }
  }
  if (nativePath) {
    const input = (await Bun.file(nativePath).json()) as Array<
      (
        | Parameters<typeof techniqueDocumentsFromNativeWiki>[0]
        | { canonical_url: string }
        | { url: string; markdown: string; format: "native-markdown" }
      ) & {
        medium: "manga" | "anime";
      }
    >;
    if (!Array.isArray(input)) throw new Error("Native input must contain parsed wiki dossiers");
    for (const dossier of input) {
      if (!["manga", "anime"].includes(dossier.medium))
        throw new Error("Native dossier needs an explicit source medium");
      if ("canonical_url" in dossier) {
        documents.push(...techniqueDocumentsFromNativeCrawl(dossier, dossier.medium));
      } else if ("format" in dossier) {
        if (dossier.format !== "native-markdown" || typeof dossier.markdown !== "string")
          throw new Error("Invalid native Markdown source");
        documents.push(...techniqueDocumentsFromNativeMarkdown(dossier));
        nativeTextSources.set(dossier.url, dossier.markdown);
      } else {
        documents.push(...techniqueDocumentsFromNativeWiki(dossier, dossier.medium));
      }
    }
  }
  const searchAliasReceipts: Array<{
    techniqueId: number;
    alias: string;
    sourceUrl: string;
    quote: string;
  }> = [];
  for (const technique of techniques) {
    const lexicon = TECHNIQUES.find(
      (entry) => entry.id === technique.id && entry.name === technique.name,
    );
    const publisher = TECHNIQUE_IMAGE_SEARCH_ALIASES.find(
      (entry) => entry.id === technique.id && entry.name === technique.name,
    );
    for (const alias of [...(lexicon?.searchAliases ?? []), ...(publisher?.aliases ?? [])]) {
      if ("official" in alias.evidence) {
        const source = nativeTextSources.get(alias.evidence.official);
        if (!source || !normalizeForQuote(source).includes(normalizeForQuote(alias.evidence.quote)))
          continue;
        technique.aliases.push(alias.name);
        searchAliasReceipts.push({
          techniqueId: technique.id,
          alias: alias.name,
          sourceUrl: alias.evidence.official,
          quote: alias.evidence.quote,
        });
        continue;
      }
      if (!("manga" in alias.evidence)) continue;
      const volume = Number(alias.evidence.manga.replace(/^vol/, ""));
      const evidence = alias.evidence;
      const document = documents.find(
        (item) =>
          item.chapterId === 1419 + volume &&
          item.locator === `chapter:${1419 + volume};page:${evidence.page}`,
      );
      if (
        !document ||
        !normalizeForQuote(document.text).includes(normalizeForQuote(evidence.quote))
      )
        continue;
      technique.aliases.push(alias.name);
      searchAliasReceipts.push({
        techniqueId: technique.id,
        alias: alias.name,
        sourceUrl: document.sourceUrl,
        quote: evidence.quote,
      });
    }
  }
  const result = discoverTechniqueImages(techniques, documents);
  await Bun.write(
    output,
    `${JSON.stringify(
      {
        ...result,
        searchAliasReceipts,
        observedAt: new Date().toISOString(),
        inputs: {
          snapshot: snapshotPath ? resolve(snapshotPath) : null,
          native: nativePath ? resolve(nativePath) : null,
          catalogue: cataloguePath ? resolve(cataloguePath) : "live-authorized-api",
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    JSON.stringify({
      output,
      documents: result.documentCount,
      techniques: result.coverage.length,
      candidates: result.candidates.length,
      techniquesWithCandidates: result.coverage.filter((row) => row.candidates > 0).length,
      verifiedImages: 0,
      status: "candidate-discovery-only",
    }),
  );
}

if (import.meta.main) await main();
