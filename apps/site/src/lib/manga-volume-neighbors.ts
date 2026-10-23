// SPDX-License-Identifier: Apache-2.0
import { mangaVolumeBibliographicRecord } from "./manga-source-registry";

type Volume = {
  id: number;
  series: string;
  volume_number: number;
  title: string | null;
  isbn?: string | null;
};

function family(volume: Volume): string {
  const publication = mangaVolumeBibliographicRecord({ ...volume, isbn: volume.isbn ?? null });
  return publication ? `publication:${publication.edition}` : "legacy";
}

/** Adjacent printed volumes stay in the same publication, even when series codes are shared. */
export function mangaVolumeNeighbors<T extends Volume>(current: Volume, volumes: readonly T[]) {
  const currentFamily = family(current);
  const siblings = volumes
    .filter((volume) => volume.series === current.series && family(volume) === currentFamily)
    .toSorted((a, b) => a.volume_number - b.volume_number || a.id - b.id);
  return {
    prev: siblings.findLast((volume) => volume.volume_number < current.volume_number) ?? null,
    next: siblings.find((volume) => volume.volume_number > current.volume_number) ?? null,
  };
}
