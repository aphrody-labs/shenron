"use client";

// SPDX-License-Identifier: Apache-2.0
import { useLangue } from "@/lib/i18n/client";
import { getWikiPortalMessages, type WikiPortalKey } from "@/lib/wiki-character-version-messages";

/** Public cached HTML starts in French and follows the same language switch as the shell. */
export function WikiPortalText({
  name,
  values,
}: {
  name: WikiPortalKey;
  values?: Record<string, string | number>;
}) {
  const { locale } = useLangue();
  return <>{getWikiPortalMessages(locale)(name, values)}</>;
}
