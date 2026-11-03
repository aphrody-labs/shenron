"use client";
// SPDX-License-Identifier: Apache-2.0
import { useLocale } from "next-intl";
import {
  wikiMediaCatalogueMessages,
  type WikiMediaMessage,
} from "@/lib/wiki-media-catalogue-messages";

export function WikiMediaText({
  name,
  values,
}: {
  name: WikiMediaMessage;
  values?: Record<string, string | number>;
}) {
  return <>{wikiMediaCatalogueMessages(useLocale())(name, values)}</>;
}
