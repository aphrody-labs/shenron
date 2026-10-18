"use client";

import { useLocale } from "next-intl";
import { T } from "@/components/T";

export function EpisodeAirDate({ seconds }: { seconds: number }) {
  const locale = useLocale();
  const date = new Date(seconds * 1000);
  return (
    <span>
      <T k="episodePage.firstBroadcast" />
      {" · "}
      <time dateTime={date.toISOString()}>
        {new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date)}
      </time>
    </span>
  );
}
