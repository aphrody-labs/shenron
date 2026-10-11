import { z } from "zod";
import { FAVORITE_KINDS, FAVORITES_MAX } from "@aphrody/shenron-config/favorites";

export const FavoriteSchema = z.object({
  kind: z.enum(FAVORITE_KINDS),
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  href: z.string().startsWith("/").max(300),
  image: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  at: z.number().finite(),
});
export const FavoritesResponse = z
  .object({ favorites: z.array(FavoriteSchema).max(FAVORITES_MAX) })
  .meta({ id: "FavoritesResponse" });
export const FavoritesSaveResponse = z
  .object({ ok: z.literal(true), count: z.number().int().min(0).max(FAVORITES_MAX) })
  .meta({ id: "FavoritesSaveResponse" });
