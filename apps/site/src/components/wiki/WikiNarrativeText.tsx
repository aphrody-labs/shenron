"use client";
// SPDX-License-Identifier: Apache-2.0
import { useLangue } from "@/lib/i18n/client";
import { wikiNarrativeMessages, type WikiNarrativeMessage } from "@/lib/wiki-narrative-messages";
export function WikiNarrativeText({
  name,
  values,
}: {
  name: WikiNarrativeMessage;
  values?: Record<string, string | number>;
}) {
  const { locale } = useLangue();
  return <>{wikiNarrativeMessages(locale)(name, values)}</>;
}
