// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { ERA_ORDER } from "@shenron/config/chronology";
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
