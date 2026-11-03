"use client";

// SPDX-License-Identifier: Apache-2.0
import { useLangue } from "@/lib/i18n/client";
import { wikiCatalogueMessages, type WikiCatalogueMessage } from "@/lib/wiki-catalogue-messages";

export function WikiCatalogueText({
  name,
  values,
}: {
  name: WikiCatalogueMessage;
  values?: Record<string, string | number>;
}) {
  const { locale } = useLangue();
  return <>{wikiCatalogueMessages(locale)(name, values)}</>;
}
