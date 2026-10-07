import { z } from "zod";

// ==========================================
// 1. ANIME-SAMA SCHEMAS & TYPES
// ==========================================

export const AnimesamaSearchResultSchema = z.object({
  slug: z.string(),
  titre: z.string(),
  titresAlternatifs: z.array(z.string()).default([]),
  url: z.string(),
  image: z.string(),
});
export type AnimesamaSearchResult = z.infer<typeof AnimesamaSearchResultSchema>;

export const AnimesamaSaisonEntrySchema = z.object({
  nom: z.string(),
  chemin: z.string(),
  saison: z.string(),
  langue: z.string(),
  url: z.string(),
  categorie: z.string().optional(),
});
export type AnimesamaSaisonEntry = z.infer<typeof AnimesamaSaisonEntrySchema>;

export const AnimesamaAnimeInfoSchema = z.object({
  slug: z.string(),
  url: z.string(),
  titre: z.string(),
  titresAlternatifs: z.array(z.string()).default([]),
  synopsis: z.string().default(""),
  image: z.string().default(""),
  genres: z.array(z.string()).default([]),
  etat: z.string().optional(),
  annee: z.union([z.number(), z.string()]).optional(),
  nombreEpisodesAnnonce: z.number().optional(),
  studios: z.array(z.string()).default([]),
  saisons: z.array(AnimesamaSaisonEntrySchema).default([]),
  scans: z.array(z.unknown()).default([]),
});
export type AnimesamaAnimeInfo = z.infer<typeof AnimesamaAnimeInfoSchema>;

export const AnimesamaLecteurSchema = z.object({
  index: z.number().optional(),
  nom: z.string().default("Lecteur"),
  hebergeur: z.string().default("unknown"),
  url: z.string(),
});
export type AnimesamaLecteur = z.infer<typeof AnimesamaLecteurSchema>;

export const AnimesamaEpisodeSchema = z.object({
  position: z.number().optional(),
  nom: z.string().default(""),
  numero: z.number().optional(),
  lecteurs: z.array(AnimesamaLecteurSchema).default([]),
});
export type AnimesamaEpisode = z.infer<typeof AnimesamaEpisodeSchema>;

export const AnimesamaSeasonEpisodesSchema = z.object({
  slug: z.string(),
  saison: z.string().default("saison1"),
  langue: z.string().default("vostfr"),
  episodes: z.array(AnimesamaEpisodeSchema).default([]),
});
export type AnimesamaSeasonEpisodes = z.infer<typeof AnimesamaSeasonEpisodesSchema>;

export interface AnimesamaGetEpisodesOptions {
  season?: string;
  lang?: "vostfr" | "vf" | "va" | "var" | "vkr" | "vcn" | "vqc" | "vf1" | "vf2" | string;
  profile?: "static" | "fast" | "http" | "stealth" | "max";
}

// ==========================================
// 2. VOIRANIME SCHEMAS & TYPES
// ==========================================

export const VoiranimeSearchResultSchema = z.object({
  slug: z.string(),
  title: z.string(),
  url: z.string(),
});
export type VoiranimeSearchResult = z.infer<typeof VoiranimeSearchResultSchema>;

export const VoiranimeEpisodeItemSchema = z.object({
  number: z.number().optional(),
  label: z.string().default(""),
  slug: z.string(),
  url: z.string(),
  releaseDate: z.string().optional(),
});
export type VoiranimeEpisodeItem = z.infer<typeof VoiranimeEpisodeItemSchema>;

export const VoiranimeAnimeInfoSchema = z.object({
  title: z.string(),
  slug: z.string(),
  url: z.string(),
  postId: z.number().optional(),
  poster: z.string().default(""),
  synopsis: z.string().default(""),
  isVF: z.boolean().default(false),
  type: z.string().optional(),
  status: z.string().optional(),
  studios: z.array(z.string()).default([]),
  genres: z.array(z.string()).default([]),
  alternativeTitles: z.record(z.string(), z.string()).optional(),
  declaredEpisodes: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  rating: z.number().optional(),
  ratingCount: z.union([z.number(), z.string()]).optional(),
  episodes: z.array(VoiranimeEpisodeItemSchema).default([]),
});
export type VoiranimeAnimeInfo = z.infer<typeof VoiranimeAnimeInfoSchema>;

export const VoiranimeResolvedSourceSchema = z.object({
  host: z.string().default("unknown"),
  originalUrl: z.string().optional(),
  directUrl: z.string().optional(),
  hlsUrl: z.string().optional(),
  qualities: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  error: z.string().optional(),
});
export type VoiranimeResolvedSource = z.infer<typeof VoiranimeResolvedSourceSchema>;

// ==========================================
// 3. MEDIAWIKI SCHEMAS & TYPES
// ==========================================

export {
  WikiSectionSchema,
  WikiSearchResultSchema,
  WikiPageDossierSchema,
  type WikiSection,
  type WikiSearchResult,
  type WikiPageDossier,
} from "../aphrody/wiki";

// ==========================================
// 4. GOOGLE TRANSLATE SCHEMAS & TYPES
// ==========================================

export {
  TranslateOptionsSchema,
  TranslationResultSchema,
  type TranslateOptions,
  type TranslationResult,
} from "../aphrody/translate";

// ==========================================
// 5. DRAGONBALLCN SCHEMAS & TYPES
// ==========================================

export * from "./contracts";
import type { DbcnCatalogCategory } from "./contracts";

// ==========================================
// 7. MEDIA STREAMS & PLAYERS SCHEMAS & TYPES
// ==========================================

export const PlayerEmbedSchema = z.object({
  name: z.string(),
  provider: z.string(),
  embedUrl: z.string(),
  lang: z.enum(["vf", "vostfr"]).optional(),
});
export type PlayerEmbed = z.infer<typeof PlayerEmbedSchema>;

export const ResolvedStreamInfoSchema = z.object({
  url: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
  type: z.string().default("application/x-mpegURL"),
  provider: z.string().optional(),
  at: z.number().default(() => Date.now()),
});
export type ResolvedStreamInfo = z.infer<typeof ResolvedStreamInfoSchema>;

export interface EpisodeResolvedStreams {
  series: string;
  numberInSeries: number;
  players: PlayerEmbed[];
  streams?: Partial<Record<"vf" | "vostfr", ResolvedStreamInfo>>;
}

// ==========================================
// 8. DB BRIDGE OPTIONS & TYPES
// ==========================================

export interface SyncChapterPagesOptions {
  series: string;
  chapterNumber?: number;
  volumeId?: number;
  did: string;
  category?: DbcnCatalogCategory;
}

export interface SyncEpisodePlayersOptions {
  series: string;
  numberInSeries: number;
  players: PlayerEmbed[];
}

export interface ChapterWithPagesResult {
  series: string;
  chapterNumber: number;
  pages: string[];
  source: "database" | "bxc_dragonballcn";
  volumeId?: number | null;
}

// ==========================================
// BXC CLIENT COMMON OPTIONS
// ==========================================

export interface BxcSpawnOptions {
  /** Installed Aphrody CLI for capabilities migrated to their Rust owners. */
  aphrodyBin?: string;
  nativeExecutor?: import("../aphrody/native-commands").NativeCommandExecutor;
  signal?: AbortSignal;
  bxcPath?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}
