// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { and, asc, count, eq, getTableColumns, ilike, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { WIKI_REGISTRY } from "@aphrody/shenron-db/wiki-registry";
import { createWikiReadRepository, escapeLike, wikiQueries } from "@aphrody/shenron-db/repos/wiki";
import type { WikiCategoryName } from "@aphrody/shenron-db/constants";
import * as tables from "@aphrody/shenron-db/bot-schema";
import { posts } from "@/db/schema";
import { db } from "@/lib/db";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { isPathPublic } from "@/lib/wiki-launch";
import { publicPostFilter } from "@/lib/posts";
import {
  externalSourceHref,
  externalSourceId,
  externalSourceUrlFromId,
  readExternalSource,
  searchExternalSources,
} from "@/lib/external-source-catalog";
import {
  CATALOG_PAGE_SIZE,
  catalogHref,
  catalogPageNumber,
  catalogPublicUrl,
  type CatalogCard,
  type CatalogDetail,
  type CatalogPage,
  type CatalogSummary,
} from "./catalog-explorer-contract";

import { isArchiveCategory, selectedArchiveEntry } from "./archive-catalog";

import { archiveFilter } from "./archive-catalog-query";
import { catalogSourceFilters, catalogSourceHost } from "./catalog-source-query";

type Extra = {
  table: PgTable;
  gate: string;
  ancestors?: SQL;
  parent?: { category: string; column: string };
  child?: string;
};
const extra: Record<string, Extra> = {
  databooks: { table: tables.botDatabooks, gate: "/wiki/databooks" },
  publications: { table: tables.botMediaPublications, gate: "/wiki/databooks" },
  manga: { table: tables.botMangaVolumes, gate: "/wiki/manga", child: "manga_chapters" },
  manga_chapters: {
    table: tables.botMangaChapters,
    gate: "/wiki/manga",
    parent: { category: "manga", column: "volumeId" },
    ancestors: sql`exists(select 1 from bot.db_manga_volumes p where p.id = ${tables.botMangaChapters.volumeId} and p.visible = true)`,
  },
  works: { table: tables.botMediaWorks, gate: "/wiki/manga", child: "editions" },
  editions: {
    table: tables.botMediaEditions,
    gate: "/wiki/manga",
    parent: { category: "works", column: "workId" },
    child: "volumes",
    ancestors: sql`exists(select 1 from bot.media_works p where p.id = ${tables.botMediaEditions.workId} and p.visible = true)`,
  },
  volumes: {
    table: tables.botMediaVolumes,
    gate: "/wiki/manga",
    parent: { category: "editions", column: "editionId" },
    child: "chapters",
    ancestors: sql`exists(select 1 from bot.media_editions e join bot.media_works w on w.id=e.work_id where e.id=${tables.botMediaVolumes.editionId} and e.visible = true and w.visible = true)`,
  },
  chapters: {
    table: tables.botMediaChapters,
    gate: "/wiki/manga",
    parent: { category: "volumes", column: "volumeId" },
    ancestors: sql`exists(select 1 from bot.media_volumes v join bot.media_editions e on e.id=v.edition_id join bot.media_works w on w.id=e.work_id where v.id=${tables.botMediaChapters.volumeId} and v.visible = true and e.visible = true and w.visible = true)`,
  },
  contributors: { table: tables.botContributors, gate: "/wiki/staff" },
  timelines: { table: tables.botNarrativeTimelines, gate: "/wiki/timeline", child: "events" },
  events: {
    table: tables.botNarrativeEvents,
    gate: "/wiki/events",
    parent: { category: "timelines", column: "timelineId" },
    ancestors: sql`exists(select 1 from bot.narrative_timelines t where t.id=${tables.botNarrativeEvents.timelineId} and t.visible = true)`,
  },
  news: { table: posts, gate: "/news" },
};
const gates: Record<string, string> = {
  planets: "/wiki/locations",
  arcs: "/wiki/sagas",
  dragons: "/wiki/characters",
  wishes: "/wiki/characters",
  battles: "/wiki/events",
  tournaments: "/wiki/events",
  voice_actors: "/wiki/staff",
  soundtracks: "/wiki/music",
  power_levels: "/wiki/power-levels",
  timeline_events: "/wiki/timeline",
};
const archiveCategories: Record<string, string> = {
  archive_movies: "archive-movies",
  archive_images: "archive-images",
};
const sourceCategory = (category: string) =>
  category === "sources" || Object.hasOwn(archiveCategories, category);
export const CATALOG_CATEGORIES = [
  ...Object.keys(WIKI_REGISTRY),
  ...Object.keys(extra),
  "sources",
  ...Object.keys(archiveCategories),
];
const wiki = createWikiReadRepository(db);
const text = (row: Record<string, unknown>, keys: string[]) =>
  keys.map((key) => row[key]).find((v): v is string => typeof v === "string" && v.length > 0) ?? "";
const fields = [
  "nameJa",
  "titleJa",
  "nameRomaji",
  "titleRomaji",
  "series",
  "kind",
  "category",
  "language",
  "edition",
  "publisher",
  "author",
  "illustrator",
  "isbn",
  "number",
  "volumeNumber",
  "chapterNumber",
  "pageCount",
  "pageColor",
  "publishedAt",
  "canon",
];
const relationKeys: Record<string, string> = {
  characterId: "characters",
  originPlanetId: "planets",
  homePlanetId: "planets",
  creatorId: "characters",
  debutEpisodeId: "episodes",
  debutChapterId: "manga_chapters",
  debutSagaId: "sagas",
  sagaId: "sagas",
  arcId: "arcs",
  timelineId: "timelines",
  workId: "works",
  editionId: "editions",
  volumeId: "volumes",
};

async function allowed(category: string): Promise<boolean> {
  if (!CATALOG_CATEGORIES.includes(category)) return false;
  if (sourceCategory(category)) return true;
  const cfg = await getLaunchConfig();
  return isPathPublic(extra[category]?.gate ?? gates[category] ?? `/wiki/${category}`, cfg);
}
export async function publicCatalogCategories(): Promise<string[]> {
  const result = await Promise.all(
    CATALOG_CATEGORIES.map(async (category) => ((await allowed(category)) ? category : null)),
  );
  return result.filter((value): value is string => value !== null);
}
function card(category: string, row: Record<string, unknown>): CatalogCard {
  const id = sourceCategory(category) ? externalSourceId(String(row.url)) : String(row.id);
  const title = text(row, ["title", "name", "label", "wishText", "characterName", "url"]) || id;
  const originalHref = sourceCategory(category)
    ? externalSourceHref(String(row.url))
    : category === "news" && typeof row.slug === "string"
      ? `/news/${encodeURIComponent(row.slug)}`
      : category === "databooks"
        ? `/wiki/databooks/${id}`
        : category === "manga_chapters"
          ? `/wiki/manga/${id}`
          : category === "chapters" && row.legacyChapterId
            ? `/wiki/manga/${row.legacyChapterId}`
            : null;
  const archive = isArchiveCategory(category)
    ? selectedArchiveEntry(category, String(row.url), String(row.title))
    : undefined;
  let image = archive?.preview ?? catalogPublicUrl(row.image ?? row.cover);
  if (
    !archive &&
    sourceCategory(category) &&
    typeof row.url === "string" &&
    row.provenance &&
    typeof row.provenance === "object"
  ) {
    const provenance = row.provenance as Record<string, unknown>;
    const rights = provenance.rights as Record<string, unknown> | undefined;
    const url = new URL(row.url);
    if (
      rights?.publicImagesPermitted === true &&
      url.origin === "https://archive.org" &&
      /^\/details\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(url.pathname)
    )
      image = `https://archive.org/services/img/${url.pathname.slice(9)}`;
  }
  return {
    category,
    id,
    title,
    description: text(row, ["description", "synopsisFr", "biographyFr", "excerpt"]).slice(0, 1800),
    image,
    href: catalogHref(category, id),
    originalHref,
    ...(archive ? { archive } : {}),
  };
}
function extraQuery(
  category: string,
  q = "",
  parent?: string,
): { table: PgTable; cols: Record<string, PgColumn>; filter: SQL | undefined } {
  const spec = extra[category]!;
  const cols = getTableColumns(spec.table) as Record<string, PgColumn>;
  const terms = [
    category === "news" ? publicPostFilter() : eq(cols.visible!, true),
    spec.ancestors,
  ];
  if (q)
    terms.push(
      or(
        ...["name", "title", "label", "titleJa", "nameJa", "slug", "isbn"]
          .filter((key) => cols[key])
          .map((key) => ilike(cols[key]!, `%${escapeLike(q)}%`)),
      ),
    );
  if (parent !== undefined) {
    if (!spec.parent || !/^\d+$/.test(parent) || !Number.isSafeInteger(Number(parent)))
      throw new Error("Invalid catalogue parent");
    terms.push(eq(cols[spec.parent.column]!, Number(parent)));
  }
  return { table: spec.table, cols, filter: and(...terms) };
}
/** Projection deliberately excludes content HTML, player objects, provider headers and OCR. */
function selected(cols: Record<string, PgColumn>) {
  const keys = new Set([
    "id",
    "title",
    "name",
    "label",
    "slug",
    "description",
    "synopsisFr",
    "biographyFr",
    "excerpt",
    "image",
    "cover",
    "sourceUrl",
    "legacyChapterId",
    ...fields,
    ...Object.keys(relationKeys),
  ]);
  return Object.fromEntries(Object.entries(cols).filter(([key]) => keys.has(key)));
}
export async function readCatalogPage(
  category: string,
  input: {
    page?: unknown;
    q?: string;
    parent?: string;
    mediaLang?: string;
    series?: string;
    order?: string;
    focus?: string;
    kind?: string;
    domain?: string;
  } = {},
): Promise<CatalogPage | null> {
  if (!(await allowed(category))) return null;
  const page = catalogPageNumber(input.page);
  const q = input.q?.trim().slice(0, 120) ?? "";
  const offset = (page - 1) * CATALOG_PAGE_SIZE;
  let rows: Record<string, unknown>[], total: number;
  if (sourceCategory(category)) {
    const filters = catalogSourceFilters(category, input);
    if (input.parent !== undefined || archiveCategories[category]) {
      const parentUrl = input.parent !== undefined ? externalSourceUrlFromId(input.parent) : null;
      if (
        input.parent !== undefined &&
        (!parentUrl || !(await readExternalSource(parentUrl, true)))
      )
        return null;
      const pattern = `%${escapeLike(q)}%`;
      const host = sql`lower(regexp_replace(split_part(split_part(r.url, '://', 2), '/', 1), '^www\\.', ''))`;
      const titleOrder = sql`lower(coalesce(nullif(r.title, ''), r.url)) asc, r.url asc`;
      const ordering =
        filters.order === "source"
          ? sql`r.kind asc, ${host} asc, ${titleOrder}`
          : filters.order === "title"
            ? titleOrder
            : filters.order === "oldest"
              ? sql`r.fetched_at asc, ${titleOrder}`
              : filters.order === "recent"
                ? sql`r.fetched_at desc, ${titleOrder}`
                : sql`case when ${q} = '' then 0 else ts_rank_cd(r.search_vector, websearch_to_tsquery('simple', ${q})) end desc, r.fetched_at desc, r.url asc`;
      const matching = and(
        isArchiveCategory(category) ? archiveFilter(category, input) : undefined,
        filters.kind
          ? sql`case when r.kind = 'official' then 'reference' else r.kind end = ${filters.kind}`
          : undefined,
        filters.domain ? sql`${host} = ${filters.domain}` : undefined,
        filters.focus === "dragon-ball"
          ? sql`r.title ~* ${"dragon[[:space:]_-]*ball|\\m(dbz|dbs|dbgt)\\M|ドラゴンボール|七龍珠|七龙珠|드래곤볼"}`
          : undefined,
        parentUrl ? sql`p.provenance->>'parentUrl' = ${parentUrl}` : undefined,
        archiveCategories[category]
          ? sql`r.kind = 'archive' and p.provenance->>'category' = ${archiveCategories[category]}`
          : undefined,
        sql`(${q} = '' or r.search_vector @@ websearch_to_tsquery('simple', ${q}) or r.title ilike ${pattern} or r.excerpt ilike ${pattern})`,
      );
      const [records, totals] = await Promise.all([
        db.execute(
          sql`select r.url, r.title, r.excerpt, r.kind, p.provenance from public.external_source_records r join public.external_source_provenance p on p.url=r.url where ${matching} order by ${ordering} limit ${CATALOG_PAGE_SIZE} offset ${offset}`,
        ),
        db.execute(
          sql`select count(*)::int as total from public.external_source_records r join public.external_source_provenance p on p.url=r.url where ${matching}`,
        ),
      ]);
      rows = records as unknown as Record<string, unknown>[];
      total = Number((totals as unknown as { total: number }[])[0]?.total ?? 0);
    } else {
      const result = await searchExternalSources({
        ...filters,
        q,
        limit: CATALOG_PAGE_SIZE,
        offset,
        strict: true,
      });
      rows = result.records;
      total = result.total;
    }
  } else if (extra[category]) {
    const query = extraQuery(category, q, input.parent);
    const [records, totals] = await Promise.all([
      db
        .select(selected(query.cols))
        .from(query.table)
        .where(query.filter)
        .orderBy(asc(query.cols.id!))
        .limit(CATALOG_PAGE_SIZE)
        .offset(offset),
      db.select({ total: count() }).from(query.table).where(query.filter),
    ]);
    rows = records;
    total = Number(totals[0]?.total ?? 0);
  } else {
    if (input.parent !== undefined) return null;
    const result = await wiki.list({
      category: category as WikiCategoryName,
      limit: CATALOG_PAGE_SIZE,
      offset,
      q,
    });
    rows = result.items;
    total = result.total;
  }
  return {
    category,
    total,
    page,
    pageSize: CATALOG_PAGE_SIZE,
    items: rows.map((row) => {
      const item = card(category, row);
      if (sourceCategory(category)) {
        item.description = item.description.slice(0, 280);
        item.source = { host: catalogSourceHost(row.url), kind: String(row.kind ?? "") };
      }
      return item;
    }),
    observedAt: new Date().toISOString(),
  };
}
async function readRow(category: string, id: string): Promise<Record<string, unknown> | null> {
  if (!(await allowed(category))) return null;
  if (sourceCategory(category)) {
    const url = externalSourceUrlFromId(id);
    const row = url ? await readExternalSource(url, true) : null;
    return row &&
      (!archiveCategories[category] ||
        (row.kind === "archive" &&
          row.provenance.category === archiveCategories[category] &&
          row.httpStatus >= 200 &&
          row.httpStatus < 300 &&
          row.provenance.reviewed === true &&
          (row.provenance.rights as Record<string, unknown> | undefined)?.publicImagesPermitted ===
            true &&
          !!selectedArchiveEntry(category, row.url, row.title)))
      ? row
      : null;
  }
  if (!extra[category]) return wiki.get({ category: category as WikiCategoryName, idOrSlug: id });
  if (category === "news") {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return null;
    const query = extraQuery(category);
    const [row] = await db
      .select(selected(query.cols))
      .from(query.table)
      .where(and(query.filter, eq(query.cols.id!, id)))
      .limit(1);
    return row ?? null;
  }
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  const query = extraQuery(category);
  const [row] = await db
    .select(selected(query.cols))
    .from(query.table)
    .where(and(query.filter, eq(query.cols.id!, Number(id))))
    .limit(1);
  return row ?? null;
}
export async function readCatalogDetail(
  category: string,
  id: string,
): Promise<CatalogDetail | null> {
  const row = await readRow(category, id);
  if (!row) return null;
  const references = {
    ...relationKeys,
    ...(extra[category]?.parent
      ? { [extra[category]!.parent!.column]: extra[category]!.parent!.category }
      : {}),
    ...(category === "manga_chapters" ? { volumeId: "manga" } : {}),
  };
  const related = (
    await Promise.all(
      Object.entries(references)
        .filter(([key]) => row[key] !== null && row[key] !== undefined)
        .map(async ([key, target]) => {
          const other = await readRow(target, String(row[key]));
          if (!other) return null;
          const item = card(target, other);
          return { category: target, id: item.id, title: item.title, href: item.href };
        }),
    )
  ).filter((value) => value !== null);
  if (sourceCategory(category) && row.provenance && typeof row.provenance === "object") {
    const parentUrl = catalogPublicUrl((row.provenance as Record<string, unknown>).parentUrl);
    if (parentUrl) {
      const parent = await readExternalSource(parentUrl, true);
      if (parent) {
        const item = card("sources", parent);
        related.push({ category: "sources", id: item.id, title: item.title, href: item.href });
      }
    }
  }
  const image = card(category, row).image;
  const child = category === "sources" ? "sources" : extra[category]?.child;
  return {
    ...card(category, row),
    fields: fields.flatMap((key) => {
      const value = row[key];
      return typeof value === "string" || typeof value === "number" || value instanceof Date
        ? [{ key, value: value instanceof Date ? value.toISOString() : String(value) }]
        : [];
    }),
    related,
    children:
      child && (await allowed(child))
        ? [{ category: child, href: `${catalogHref(child)}?parent=${encodeURIComponent(id)}` }]
        : [],
    assets: image ? [image] : [],
  };
}
export async function readCatalogSummary(): Promise<CatalogSummary> {
  const categories = await publicCatalogCategories();
  // Keep PG pool pressure bounded even with dozens of catalogue families.
  const result: CatalogSummary["categories"] = [];
  for (let start = 0; start < categories.length; start += 3) {
    result.push(
      ...(await Promise.all(
        categories.slice(start, start + 3).map(async (category) => {
          let total: number;
          if (sourceCategory(category)) {
            const filter = archiveCategories[category]
              ? sql`where r.kind='archive' and p.provenance->>'category'=${archiveCategories[category]} and ${archiveFilter(category)}`
              : sql``;
            const counts = await db.execute(
              sql`select count(*)::int as total from public.external_source_records r left join public.external_source_provenance p on p.url=r.url ${filter}`,
            );
            total = Number((counts as unknown as { total: number }[])[0]?.total ?? 0);
          } else if (extra[category]) {
            const query = extraQuery(category);
            const [row] = await db.select({ total: count() }).from(query.table).where(query.filter);
            total = Number(row?.total ?? 0);
          } else {
            const [row] = await wikiQueries(db).count(category as WikiCategoryName);
            total = Number(row?.total ?? 0);
          }
          return { category, total, href: catalogHref(category) };
        }),
      )),
    );
  }
  return { categories: result, observedAt: new Date().toISOString() };
}
