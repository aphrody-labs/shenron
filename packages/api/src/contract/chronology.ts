// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { ERA_ORDER } from "@aphrody/shenron-config/chronology";
const override = z.object({
  hidden: z.boolean().optional(),
  era: z.enum(ERA_ORDER).optional(),
  date: z.number().nullable().optional(),
  title: z.string().optional(),
  note: z.string().optional(),
  sort: z.number().optional(),
});
export const ChronologySchema = z
  .object({
    version: z.literal(1),
    eraOrder: z.array(z.enum(ERA_ORDER)),
    overrides: z.record(z.string(), override),
  })
  .meta({ id: "Chronology" });
export const ChronologyResponse = z
  .object({ config: ChronologySchema })
  .meta({ id: "ChronologyResponse" });
export const ChronologySaveResponse = ChronologyResponse.extend({ ok: z.literal(true) }).meta({
  id: "ChronologySaveResponse",
});
export const TimelineItemSchema = z.object({
  kind: z.enum(["episode", "movie", "manga"]),
  id: z.number(),
  href: z.string(),
  title: z.string(),
  titleJa: z.string().nullable(),
  series: z.string(),
  era: z.enum(ERA_ORDER),
  number: z.number().nullable(),
  date: z.number().nullable(),
  image: z.string().nullable(),
  hasVf: z.boolean(),
  hasVostfr: z.boolean(),
});
export const TimelineItemsResponse = z
  .object({ items: z.array(TimelineItemSchema) })
  .meta({ id: "TimelineItemsResponse" });

/** Existing public wiki field names are preserved for consumers. */
export const TimelineEventSchema = z.object({
  id: z.number(),
  age_year: z.number(),
  age_month: z.number().nullable(),
  age_day: z.number().nullable(),
  era: z.string(),
  title: z.string(),
  title_ja: z.string().nullable(),
  description: z.string(),
  characters_involved: z.array(z.string()).nullable(),
  source_ref: z.string().nullable(),
  canon: z.boolean(),
  order_idx: z.number(),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export const TimelineEventsQuery = z.object({ era: z.string().max(128).optional() });
export const TimelineEventsResponse = z
  .object({ events: z.array(TimelineEventSchema) })
  .meta({ id: "TimelineEventsResponse" });
export const TimelineAtlasResponse = z
  .object({
    sagas: z.array(
      z.object({
        id: z.number(),
        slug: z.string(),
        name: z.string(),
        series: z.string(),
        description: z.string().nullable(),
        image: z.string().nullable(),
      }),
    ),
    arcs: z.array(
      z.object({
        id: z.number(),
        saga_id: z.number(),
        slug: z.string(),
        name: z.string(),
      }),
    ),
    databooks: z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        cover: z.string().nullable(),
        category: z.string().nullable(),
        kind: z.string(),
      }),
    ),
  })
  .meta({ id: "TimelineAtlasResponse" });
export type TimelineAtlas = z.infer<typeof TimelineAtlasResponse>;
