// SPDX-License-Identifier: Apache-2.0
// Readers: the databook reader is Shenron's (Dragon Ball editorial format); the generic manga
// and collection readers stay in @aphrody/m3-reader.
export { DatabookReader } from "./DatabookReader";
export type {
  DatabookReaderPage,
  DatabookReaderProps,
  ReaderTranscription,
} from "./DatabookReader";
export { CollectionReader, MangaReader } from "@aphrody/m3-reader/source";
export type {
  CollectionReaderProps,
  MangaReaderProps,
  ReaderCollectionChapter,
  ReaderCollectionEdition,
} from "@aphrody/m3-reader/source";
