"use client";

// SPDX-License-Identifier: Apache-2.0
import { useTranslations } from "next-intl";
import { EpisodeCard } from "@/components/stream/EpisodeCard";
import { DBS_BEERUS_EPISODE_HREF } from "@/lib/episode-series-catalogue";

export function OfficialBeerusCard() {
  const t = useTranslations("dbsBeerus");
  return (
    <EpisodeCard
      href={DBS_BEERUS_EPISODE_HREF}
      number={131}
      title={t("episodeTitle")}
      image={null}
      playerCount={0}
    />
  );
}
