#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0

import { resolve } from "node:path";

type SourceAnchor = { title: string; url: string; anchor: string };
type ArticleDraft = {
  title: string;
  markdown: string;
  sources: SourceAnchor[];
  slug?: string;
  excerpt?: string;
  tags?: string[];
  cover?: string;
  coverAlt?: string;
  seoTitle?: string;
  seoDescription?: string;
};

const ORIGIN = "https://dragonballfr.com";
const USAGE = "Usage: bun scripts/ops/create-article-draft.ts <article.json> [--submit]";

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDraft(value: unknown): ArticleDraft {
  if (!isRecord(value)) fail("Le fichier doit contenir un objet JSON.");
  const { title, markdown, sources } = value;
  if (typeof title !== "string" || title.trim().length < 3)
    fail("title doit contenir au moins 3 caractères.");
  if (typeof markdown !== "string" || !markdown.trim() || markdown.length > 120_000)
    fail("markdown doit contenir entre 1 et 120 000 caractères.");
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 8)
    fail("Fournir de 1 à 8 sources avec title, url et anchor.");

  const normalizedSources = sources.map((source, index): SourceAnchor => {
    if (!isRecord(source)) fail(`sources[${index}] doit être un objet.`);
    const { title: sourceTitle, url, anchor } = source;
    if (typeof sourceTitle !== "string" || !sourceTitle.trim())
      fail(`sources[${index}].title est requis.`);
    if (typeof url !== "string") fail(`sources[${index}].url est requis.`);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      fail(`sources[${index}].url n'est pas une URL valide.`);
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      fail(`sources[${index}].url doit être une URL HTTPS publique.`);
    if (/(^|\.)fandom\.com$/i.test(parsed.hostname))
      fail("Fandom n'est pas une source admissible.");
    if (typeof anchor !== "string" || anchor.trim().length < 12)
      fail(`sources[${index}].anchor doit identifier une affirmation d'au moins 12 caractères.`);
    if (!markdown.includes(anchor))
      fail(`L'affirmation de sources[${index}] doit apparaître exactement dans markdown.`);
    return { title: sourceTitle.trim(), url: parsed.toString(), anchor };
  });

  for (const field of [
    "slug",
    "excerpt",
    "cover",
    "coverAlt",
    "seoTitle",
    "seoDescription",
  ] as const)
    if (value[field] !== undefined && typeof value[field] !== "string")
      fail(`${field} doit être une chaîne.`);
  if (
    value.tags !== undefined &&
    (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string"))
  )
    fail("tags doit être une liste de chaînes.");

  return {
    title: title.trim(),
    markdown,
    sources: normalizedSources,
    ...(typeof value.slug === "string" ? { slug: value.slug } : {}),
    ...(typeof value.excerpt === "string" ? { excerpt: value.excerpt } : {}),
    ...(Array.isArray(value.tags) ? { tags: value.tags as string[] } : {}),
    ...(typeof value.cover === "string" ? { cover: value.cover } : {}),
    ...(typeof value.coverAlt === "string" ? { coverAlt: value.coverAlt } : {}),
    ...(typeof value.seoTitle === "string" ? { seoTitle: value.seoTitle } : {}),
    ...(typeof value.seoDescription === "string" ? { seoDescription: value.seoDescription } : {}),
  };
}

function citeAnchors(markdown: string, sources: SourceAnchor[]): string {
  let result = markdown;
  for (const source of sources) {
    const citation = ` ([${source.title.replaceAll("]", "\\]")}](${source.url}))`;
    result = result.replace(source.anchor, `${source.anchor}${citation}`);
  }
  return result;
}

const args = Bun.argv.slice(2);
const submit = args.includes("--submit");
const positional = args.filter((arg) => arg !== "--submit");
if (positional.length !== 1 || positional[0] === "--help") fail(USAGE);

const inputPath = resolve(positional[0]);
const draft = readDraft(await Bun.file(inputPath).json());
const payload = {
  ...draft,
  markdown: citeAnchors(draft.markdown, draft.sources),
  status: "draft",
};
const receipt = {
  mode: submit ? "draft-submit" : "dry-run",
  title: payload.title,
  slug: payload.slug ?? null,
  sourceCount: draft.sources.length,
  markdownCharacters: payload.markdown.length,
  status: "draft",
};

if (!submit) {
  console.log(JSON.stringify(receipt));
  process.exit(0);
}

const agentKey = await Bun.secrets.get({ service: "shenron-mcp", name: "agent-api" });
if (!agentKey) fail("La clé agent Shenron est absente du Gestionnaire d'identifiants Windows.");

const createdResponse = await fetch(`${ORIGIN}/api/agent/v1/articles`, {
  method: "POST",
  headers: { authorization: `Bearer ${agentKey}`, "content-type": "application/json" },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(20_000),
});
const created = await createdResponse.json().catch(() => null);
if (!createdResponse.ok || created?.ok !== true || typeof created?.data?.slug !== "string")
  fail(`Création du brouillon refusée (HTTP ${createdResponse.status}).`);

const slug = created.data.slug as string;
const readbackResponse = await fetch(
  `${ORIGIN}/api/agent/v1/articles?status=draft&page=1&perPage=100`,
  {
    headers: { authorization: `Bearer ${agentKey}` },
    signal: AbortSignal.timeout(20_000),
  },
);
const readback = await readbackResponse.json().catch(() => null);
if (
  !readbackResponse.ok ||
  readback?.ok !== true ||
  !readback?.data?.articles?.some(
    (article: { slug?: string; status?: string }) =>
      article.slug === slug && article.status === "draft",
  )
)
  fail(`Le brouillon ${slug} n'a pas été retrouvé dans la lecture de vérification.`);

console.log(
  JSON.stringify({
    ...receipt,
    mode: "submitted",
    slug,
    url: `${ORIGIN}/news/${slug}`,
    verified: true,
  }),
);
