// SPDX-License-Identifier: Apache-2.0
/** Generic edition-checked entry point; SQL, backup and replay stay in one canonical writer. */
import { importSoshReaders, type SoshAssetFetcher } from "./import-sosh-readers";
export { missingReaderChapters } from "./import-sosh-readers";
export { validateMangaReaderManifest } from "../../packages/pipeline/src/dragon-ball/sosh-reader-manifest";
export const importMangaReaders = (args = Bun.argv.slice(2), fetcher: SoshAssetFetcher = fetch) =>
  importSoshReaders(args, fetcher, "MANGA");
if (import.meta.main) await importMangaReaders();
