// SPDX-License-Identifier: Apache-2.0
import { EDITION_PAR_SERIE } from "./manga-editions";
import { mangaVolumeBibliographicRecord } from "./manga-source-registry";

/** ISBN publication identity takes precedence over a series shared by several languages. */
export function mangaVolumeEdition(
  series: string,
  volume?: { id: number; isbn?: string | null; title: string | null } | null,
) {
  const fallback = EDITION_PAR_SERIE[series] ?? { langue: "fr", colorisation: "nb" };
  const record = volume
    ? mangaVolumeBibliographicRecord({ ...volume, isbn: volume.isbn ?? null })
    : null;
  const language = record?.language ?? fallback.langue;
  const colorization =
    record && ["shueisha_sd_full_color", "shueisha_digital_color"].includes(record.edition)
      ? "color"
      : fallback.colorisation === "couleur"
        ? "color"
        : "bw";
  return {
    language,
    colorization,
    langue: language,
    colorisation: colorization === "color" ? "couleur" : "nb",
  };
}
