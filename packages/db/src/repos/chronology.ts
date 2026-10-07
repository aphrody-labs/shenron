// SPDX-License-Identifier: Apache-2.0
import { and, asc, eq, or, sql } from "drizzle-orm";
import { eraOf, type TimelineItem, type ChronologyConfig } from "@shenron/config/chronology";
import { chronologyConfig } from "../schema";
import type { ShenronPgDatabase } from "../types";

// oxlint-disable-next-line no-explicit-any -- accepts both PostgreSQL driver schemas
type ChronologyDatabase = ShenronPgDatabase<any>;
import {
  botEpisodes,
  botMovies,
  botMangaVolumes,
  botTimelineEvents,
  botSagas,
  botArcs,
  botDatabooks,
} from "../bot-schema";
const SINGLETON_ID = "default";

export function createChronologyConfigRepository(db: ChronologyDatabase) {
  return {
    async events(era?: string) {
      return db
        .select({
          id: botTimelineEvents.id,
          age_year: botTimelineEvents.ageYear,
          age_month: botTimelineEvents.ageMonth,
          age_day: botTimelineEvents.ageDay,
          era: botTimelineEvents.era,
          title: botTimelineEvents.title,
          title_ja: botTimelineEvents.titleJa,
          description: botTimelineEvents.description,
          characters_involved: botTimelineEvents.charactersInvolved,
          source_ref: botTimelineEvents.sourceRef,
          canon: botTimelineEvents.canon,
          order_idx: botTimelineEvents.orderIdx,
        })
        .from(botTimelineEvents)
        .where(
          and(
            eq(botTimelineEvents.visible, true),
            era ? eq(botTimelineEvents.era, era) : undefined,
          ),
        )
        .orderBy(asc(botTimelineEvents.ageYear), asc(botTimelineEvents.orderIdx));
    },
    async atlas() {
      const [sagas, arcs, databooks] = await Promise.all([
        db
          .select({
            id: botSagas.id,
            slug: botSagas.slug,
            name: botSagas.name,
            series: sql<string>`coalesce(${botSagas.series}, '')`,
            description: botSagas.description,
            image: botSagas.image,
          })
          .from(botSagas)
          .where(eq(botSagas.visible, true))
          .orderBy(asc(botSagas.orderIdx)),
        db
          .select({
            id: botArcs.id,
            saga_id: botSagas.id,
            slug: botArcs.slug,
            name: botArcs.name,
          })
          .from(botArcs)
          .innerJoin(botSagas, eq(botArcs.sagaId, botSagas.id))
          .where(and(eq(botArcs.visible, true), eq(botSagas.visible, true)))
          .orderBy(asc(botSagas.orderIdx), asc(botArcs.orderIdx)),
        db
          .select({
            id: botDatabooks.id,
            title: botDatabooks.title,
            cover: botDatabooks.cover,
            category: botDatabooks.category,
            kind: botDatabooks.kind,
          })
          .from(botDatabooks)
          .where(eq(botDatabooks.visible, true))
          .orderBy(asc(botDatabooks.publishedAt)),
      ]);
      return { sagas, arcs, databooks };
    },
    async timeline(): Promise<TimelineItem[]> {
      const [eps, movs, vols] = await Promise.all([
        db
          .select({
            id: botEpisodes.id,
            series: botEpisodes.series,
            number: botEpisodes.numberInSeries,
            title: botEpisodes.title,
            titleJa: botEpisodes.titleJa,
            date: botEpisodes.airDate,
            image: botEpisodes.image,
            players: botEpisodes.players,
          })
          .from(botEpisodes)
          .where(eq(botEpisodes.visible, true)),
        db
          .select({
            id: botMovies.id,
            slug: botMovies.slug,
            series: botMovies.series,
            title: botMovies.title,
            titleJa: botMovies.titleJa,
            date: botMovies.releaseDate,
            poster: botMovies.poster,
            players: botMovies.players,
          })
          .from(botMovies)
          .where(eq(botMovies.visible, true)),
        // Tomes canoniques uniquement : les spin-offs (SD, Yamcha, Episode of
        // Bardock…) vivent dans la même table sous d'AUTRES codes série, donc
        // le filtre porte sur la série, pas sur le titre.
        //
        // Le filtre précédent exigeait un titre « Dragon Ball Vol. N » — et le
        // tome 1, seul du catalogue à porter son vrai titre (« Son Goku et ses
        // amis »), était donc absent de la frise : la chronologie du manga
        // commençait au tome 2. Vérifié en base avant la bascule : sous `DB` et
        // `DBS`, cette table ne contient QUE les 42 + 24 tomes canoniques.
        db
          .select({
            id: botMangaVolumes.id,
            series: botMangaVolumes.series,
            number: botMangaVolumes.volumeNumber,
            title: botMangaVolumes.title,
            titleJa: botMangaVolumes.titleJa,
            date: botMangaVolumes.publishedAt,
            cover: botMangaVolumes.cover,
          })
          .from(botMangaVolumes)
          .where(
            and(
              eq(botMangaVolumes.visible, true),
              or(eq(botMangaVolumes.series, "DB"), eq(botMangaVolumes.series, "DBS")),
            ),
          ),
      ]);
      // Garde `Array.isArray` : `players` jsonb peut être un scalaire corrompu
      // (piège documenté) → un `.some` non gardé planterait tout le dataset.
      const langs = (
        players: { lang?: "vf" | "vostfr" }[] | null,
      ): { hasVf: boolean; hasVostfr: boolean } => {
        const arr = Array.isArray(players) ? players : [];
        return {
          hasVf: arr.some((p) => p?.lang === "vf"),
          hasVostfr: arr.some((p) => p?.lang === "vostfr"),
        };
      };
      const items: TimelineItem[] = [
        ...eps.map((e) => {
          const l = langs(e.players);
          return {
            kind: "episode" as const,
            id: e.id,
            href: `/wiki/episodes/${e.id}`,
            title: e.title ?? "",
            titleJa: e.titleJa,
            series: e.series,
            era: eraOf(e.series),
            number: e.number ?? null,
            date: e.date ?? null,
            image: e.image,
            hasVf: l.hasVf,
            hasVostfr: l.hasVostfr,
          };
        }),
        ...movs.map((m) => {
          const l = langs(m.players);
          return {
            kind: "movie" as const,
            id: m.id,
            href: `/wiki/movies/${m.slug ?? m.id}`,
            title: m.title ?? "",
            titleJa: m.titleJa,
            series: m.series ?? "",
            era: eraOf(m.series),
            number: null,
            date: m.date ?? null,
            image: m.poster,
            hasVf: l.hasVf,
            hasVostfr: l.hasVostfr,
          };
        }),
        ...vols.map((v) => ({
          kind: "manga" as const,
          id: v.id,
          href: `/wiki/manga/volume/${v.id}`,
          title: v.title ?? `Tome ${v.number ?? "?"}`,
          titleJa: v.titleJa,
          series: v.series,
          era: "Manga" as const,
          number: v.number ?? null,
          date: v.date ?? null,
          image: v.cover,
          hasVf: false,
          hasVostfr: false,
        })),
      ];
      return items;
    },
    async read(): Promise<unknown> {
      const [row] = await db
        .select({ data: chronologyConfig.data })
        .from(chronologyConfig)
        .where(eq(chronologyConfig.id, SINGLETON_ID))
        .limit(1);
      return row?.data ?? null;
    },
    async save(config: ChronologyConfig, by: string | null): Promise<void> {
      // Bind JSON as text first: Bun.SQL otherwise encodes Drizzle's JSON string again.
      const data = sql`${JSON.stringify(config)}::text::jsonb`;
      const updatedAt = new Date();
      await db
        .insert(chronologyConfig)
        .values({ id: SINGLETON_ID, data, updatedBy: by, updatedAt })
        .onConflictDoUpdate({
          target: chronologyConfig.id,
          set: { data, updatedBy: by, updatedAt },
        });
    },
  };
}
