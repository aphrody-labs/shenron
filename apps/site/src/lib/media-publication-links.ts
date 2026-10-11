// SPDX-License-Identifier: Apache-2.0
export function mediaPublicationLink(volume: {
  id: number;
  legacyVolumeId: number | null;
  visibleLegacyId: number | null;
  number: string;
  title: string | null;
}) {
  const legacyId = volume.visibleLegacyId === volume.legacyVolumeId ? volume.visibleLegacyId : null;
  return {
    id: Number(volume.id),
    number: volume.number,
    title: volume.title,
    legacy_volume_id: legacyId == null ? null : Number(legacyId),
    href: legacyId == null ? null : `/wiki/manga/volume/${legacyId}`,
    api: legacyId == null ? null : `/api/manga/volume/${legacyId}`,
  };
}
