// SPDX-License-Identifier: Apache-2.0
// Readers: the databook reader is Shenron's (Dragon Ball editorial format); the generic manga
// and collection readers stay in @aphrody/m3-reader. The manga reader is wrapped only to make
// its fullscreen cover the whole desktop window under Tauri.
export { DatabookReader } from "./DatabookReader";
export {
  MangaPage3D,
  type MangaPage3DProps,
  type MangaSceneRenderer,
  type MangaSceneRendererFactory,
} from "./MangaPage3D";
export type {
  DatabookReaderPage,
  DatabookReaderProps,
  ReaderTranscription,
} from "./DatabookReader";
export { CanonicalMangaReader, MangaReader } from "./MangaReader";
export { CollectionReader } from "@aphrody/m3-reader/source";
export { useKoharuCanvasWarmup } from "./use-koharu-canvas";
export type { KoharuCanvasWarmup } from "./use-koharu-canvas";
export type {
  CollectionReaderProps,
  MangaReaderProps,
  ReaderCollectionChapter,
  ReaderCollectionEdition,
} from "@aphrody/m3-reader/source";
export {
  TauriFullscreenSync,
  isTauriWindowFullscreen,
  setTauriWindowFullscreen,
  useTauriFullscreen,
} from "./use-tauri-fullscreen";
export {
  IDENTITY as ZOOM_IDENTITY,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  usePinchZoom,
  zoomAround,
  type ZoomState,
} from "./use-pinch-zoom";
export { LARGE_SCREEN_QUERY, useFullscreen, useMediaQuery } from "./use-reader-core";
