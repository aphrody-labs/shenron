/** zod v4 schemas of every JSON response of the private server. */
import { z } from "zod";

export const Dbxv2HealthSchema = z.object({ ok: z.literal(true) });
export type Dbxv2Health = z.infer<typeof Dbxv2HealthSchema>;

export const Dbxv2CpkInfoSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_]+$/),
  size: z.number().int().nonnegative(),
  mtime: z.string(),
});
export type Dbxv2CpkInfo = z.infer<typeof Dbxv2CpkInfoSchema>;
export const Dbxv2CpkListSchema = z.array(Dbxv2CpkInfoSchema);

export const Dbxv2IndexEntrySchema = z.object({
  cpk: z.string(),
  path: z.string(),
  offset: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  extract_size: z.number().int().nonnegative(),
  compressed: z.boolean(),
});
export type Dbxv2IndexEntry = z.infer<typeof Dbxv2IndexEntrySchema>;

export const Dbxv2FindResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  entries: z.array(Dbxv2IndexEntrySchema),
});
export type Dbxv2FindResponse = z.infer<typeof Dbxv2FindResponseSchema>;

export const Dbxv2ErrorBodySchema = z.object({ error: z.string() });

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
const Vec2 = z.tuple([z.number(), z.number()]);

/** Geometry and texture metadata of an assembled EMD (no pixels; the skeleton stays opaque). */
export const Dbxv2ModelPrimitiveSchema = z.looseObject({
  name: z.string().default(""),
  materialName: z.string().default(""),
  positions: z.array(Vec3).default([]),
  normals: z.array(Vec3).default([]),
  uv: z.array(Vec2).default([]),
  indices: z.array(z.number().int().nonnegative()).default([]),
  textureIndex: z.number().int().nonnegative().nullish(),
});
export type Dbxv2ModelPrimitive = z.infer<typeof Dbxv2ModelPrimitiveSchema>;

export const Dbxv2ModelJsonSchema = z.looseObject({
  name: z.string().default(""),
  primitives: z.array(Dbxv2ModelPrimitiveSchema).default([]),
  textures: z
    .array(
      z.looseObject({ width: z.number().int().positive(), height: z.number().int().positive() }),
    )
    .default([]),
  skeleton: z.unknown().optional(),
});
export type Dbxv2ModelJson = z.infer<typeof Dbxv2ModelJsonSchema>;
