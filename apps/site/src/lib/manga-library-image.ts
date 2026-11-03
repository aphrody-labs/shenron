// SPDX-License-Identifier: Apache-2.0
import { assetUrl } from "./assets";
import { readerAssetUrl } from "./reader-assets";

/** Library thumbnails share the reader's owned scan mount, including bibliographic covers. */
export function mangaLibraryImageUrl(path: string): string {
  const reader = readerAssetUrl(path);
  return /^\/assets\/(?:manga|dragonballcn)\//.test(reader) ? reader : assetUrl(path);
}
