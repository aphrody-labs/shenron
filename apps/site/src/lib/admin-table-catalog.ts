// SPDX-License-Identifier: Apache-2.0
import { WIKI_TABLE_SPECS } from "./wiki-tables";

export type AdminTableSpec = {
  name: string;
  pk: string;
  readonly: boolean;
  mutableColumns: string[];
  description: string | null;
};

/** The site's editorial contract remains usable when the independent bot is offline or outdated. */
export function mergeAdminTableCatalog(remote: readonly AdminTableSpec[] = []): AdminTableSpec[] {
  const tables = new Map(remote.map((table) => [table.name, table]));
  for (const spec of Object.values(WIKI_TABLE_SPECS))
    tables.set(spec.name, {
      name: spec.name,
      pk: Array.isArray(spec.pk) ? spec.pk.join(",") : spec.pk,
      readonly: false,
      mutableColumns: [...spec.mutableColumns],
      description: null,
    });
  return [...tables.values()];
}
