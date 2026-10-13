// SPDX-License-Identifier: Apache-2.0
import { mkdir, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";

export const ARCHIVE_COLLECTIONS = [
  {
    category: "archive-movies",
    mediaType: "movies",
    evidence: "https://archive.org/search?query=dragon+ball&tab=movies",
  },
  {
    category: "archive-images",
    mediaType: "image",
    evidence: "https://archive.org/details/image?tab=collection&query=dragon+ball",
  },
] as const;
type ArchiveItem = {
  identifier: string;
  title?: string;
  creator?: string | string[];
  date?: string;
  language?: string | string[];
  licenseurl?: string | string[];
  mediatype: string;
  collection?: string[];
};
const digest = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
const value = (item: unknown) =>
  typeof item === "string"
    ? item.slice(0, 1000)
    : Array.isArray(item)
      ? item
          .filter((entry) => typeof entry === "string")
          .join(", ")
          .slice(0, 1000)
      : "";
export function projectArchiveItem(
  item: ArchiveItem,
  category: (typeof ARCHIVE_COLLECTIONS)[number],
  timestamp: string,
  rightsEstablished: boolean,
) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(item.identifier) ||
    item.mediatype !== category.mediaType
  )
    throw new Error("Archive item identity differs");
  const url = `https://archive.org/details/${encodeURIComponent(item.identifier)}`;
  const title = value(item.title) || item.identifier;
  const metadata = {
    identifier: item.identifier,
    title,
    creator: value(item.creator),
    date: value(item.date),
    language: value(item.language),
    license: value(item.licenseurl),
    mediaType: item.mediatype,
    query: "dragon ball",
    evidence: category.evidence,
    ownerRightsEstablished: rightsEstablished,
  };
  // Original factual notice; the archive description and media body are not copied.
  const notice = [
    `Internet Archive — ${title}.`,
    `Identifiant : ${item.identifier}.`,
    `Type : ${item.mediatype}.`,
    metadata.creator && `Créateur déclaré : ${metadata.creator}.`,
    metadata.date && `Date déclarée : ${metadata.date}.`,
    metadata.language && `Langue déclarée : ${metadata.language}.`,
    metadata.license && `Licence déclarée : ${metadata.license}.`,
    `Notice : ${url}`,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    crawl_id: `internet-archive-${category.mediaType}-${timestamp}`,
    document_uid: digest(url),
    canonical_url: url,
    source_domain: "archive.org",
    category: category.category,
    http_status: 200,
    raw_checksum: digest(JSON.stringify(item)),
    timestamp_utc: timestamp,
    canonical_eligible: false,
    provenance: metadata,
    payload: {
      title_raw: title,
      body_markdown: notice,
      public_excerpt: notice,
      embedded_media: [],
    },
  };
}
export function archiveSearchUrl(mediaType: string, page: number, cutoff: string, rows = 500): URL {
  const url = new URL("https://archive.org/advancedsearch.php");
  url.searchParams.set(
    "q",
    `dragon ball AND mediatype:${mediaType} AND publicdate:[* TO ${cutoff.slice(0, 10)}]`,
  );
  for (const field of [
    "identifier",
    "title",
    "creator",
    "date",
    "language",
    "licenseurl",
    "mediatype",
    "collection",
  ])
    url.searchParams.append("fl[]", field);
  url.searchParams.append("sort[]", "identifier asc");
  url.searchParams.set("rows", String(rows));
  url.searchParams.set("page", String(page));
  url.searchParams.set("output", "json");
  return url;
}
export async function collectArchiveCatalog(
  out: string,
  rightsEstablished: boolean,
  fetcher: typeof fetch = fetch,
) {
  const root = resolve(out);
  await mkdir(root, { recursive: true, mode: 0o700 });
  if ((await lstat(root)).isSymbolicLink())
    throw new Error("Archive output must be a regular directory");
  const timestamp = new Date().toISOString();
  const records = new Map<string, ReturnType<typeof projectArchiveItem>>();
  const collections: {
    category: string;
    expected: number;
    collected: number;
    identitySha256: string;
    query: string;
  }[] = [];
  for (const category of ARCHIVE_COLLECTIONS) {
    const identities: string[] = [];
    let expected: number | undefined;
    for (let page = 1; page <= 200; page++) {
      const url = archiveSearchUrl(category.mediaType, page, timestamp);
      const response = await fetcher(url, {
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: { "user-agent": "Shenron catalogue metadata (dragonballfr.com)" },
      });
      if (!response.ok) throw new Error(`Archive search HTTP ${response.status}`);
      const data = (await response.json()) as {
        response: { numFound: number; docs: ArchiveItem[] };
      };
      if (
        !Number.isSafeInteger(data.response?.numFound) ||
        data.response.numFound < 0 ||
        data.response.numFound > 100_000 ||
        !Array.isArray(data.response.docs) ||
        data.response.docs.length > 500
      )
        throw new Error("Archive search contract differs");
      if (expected === undefined) expected = data.response.numFound;
      if (expected !== data.response.numFound)
        throw new Error("Archive catalogue changed during enumeration");
      for (const item of data.response.docs) {
        const record = projectArchiveItem(item, category, timestamp, rightsEstablished);
        if (records.has(record.canonical_url))
          throw new Error("Archive returned duplicate catalogue identity");
        records.set(record.canonical_url, record);
        identities.push(item.identifier);
      }
      if (identities.length === expected) break;
      if (data.response.docs.length === 0 || page === 200 || identities.length > expected)
        throw new Error("Archive enumeration is incomplete");
    }
    // Independent count at the same public-date boundary; reject drift before sealing.
    const recheck = await fetcher(archiveSearchUrl(category.mediaType, 1, timestamp, 1), {
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
    if (!recheck.ok) throw new Error(`Archive count recheck HTTP ${recheck.status}`);
    const last = (await recheck.json()) as { response: { numFound: number } };
    if (last.response.numFound !== expected)
      throw new Error("Archive catalogue changed before sealing");
    collections.push({
      category: category.category,
      expected: expected!,
      collected: identities.length,
      identitySha256: digest(identities.toSorted().join("\n")),
      query: archiveSearchUrl(category.mediaType, 1, timestamp).href,
    });
  }
  const exportBody =
    [...records.values()].map((record) => JSON.stringify(record)).join("\n") + "\n";
  const policy = {
    version: 1,
    profile: "dbfr",
    sources: [
      {
        domain: "archive.org",
        kind: "archive",
        reviewed: true,
        evidence: ARCHIVE_COLLECTIONS[0].evidence,
        rights: {
          ragPermitted: false,
          trainingPermitted: false,
          publicImagesPermitted: rightsEstablished,
        },
      },
    ],
  };
  const report = {
    schema: "shenron-archive-catalog/v1",
    observedAt: timestamp,
    collections,
    records: records.size,
    exportSha256: digest(exportBody),
    complete: true,
    rights: {
      establishedBy: rightsEstablished ? "owner-request" : null,
      assertedAt: rightsEstablished ? "2026-10-13" : null,
    },
    mediaDownloaded: 0,
    canonicalPromotions: 0,
  };
  for (const [name, body] of [
    ["native-export.jsonl", exportBody],
    ["policy.json", JSON.stringify(policy, null, 2)],
    ["collection.json", JSON.stringify(report, null, 2)],
  ]) {
    const path = join(root, name!);
    if (await Bun.file(path).exists()) throw new Error("Archive receipt already exists");
    await Bun.write(path, body!);
  }
  return report;
}
if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { out: { type: "string" }, "rights-established": { type: "boolean", default: false } },
    strict: true,
  });
  if (!values.out)
    throw new Error(
      "Usage: enrich-internet-archive.ts --out <protected-job-directory> [--rights-established]",
    );
  console.log(
    JSON.stringify(await collectArchiveCatalog(values.out, values["rights-established"] === true)),
  );
}
