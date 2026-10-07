// SPDX-License-Identifier: Apache-2.0
"use client";
import Link from "next/link";
import { useLocale } from "next-intl";
import {
  DragonRadarSearch as SharedDragonRadarSearch,
  type RadarLinkProps,
} from "@shenron/ui/public/DragonRadarSearch";
import { createDragonRadarHttpTransport } from "@shenron/ui/public/dragon-radar-http";
import { getDragonRadarMessages } from "@shenron/ui/public/dragon-radar-messages";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import { assetUrl } from "@/lib/assets";
import { getRadarSuggestions } from "./dragon-radar-suggestions";
const transport = createDragonRadarHttpTransport();
const GatedLink = (props: RadarLinkProps) => <ClientGatedWrap access={undefined} {...props} />;
export function DragonRadarSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const locale = useLocale();
  return (
    <SharedDragonRadarSearch
      initialQuery={initialQuery}
      transport={transport}
      messages={getDragonRadarMessages(locale)}
      suggestions={getRadarSuggestions(locale)}
      Link={Link}
      GatedLink={GatedLink}
      assetUrl={assetUrl}
    />
  );
}
