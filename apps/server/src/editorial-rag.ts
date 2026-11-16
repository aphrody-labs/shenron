// SPDX-License-Identifier: Apache-2.0
import { ShenronComputeClient } from "@shenron/pipeline/shenron/compute";
import { requireAiHttpToken, requireAiHttpUrl } from "@shenron/pipeline/ai/config";
import type { EnvSource } from "@shenron/config/env";
import { isPublicRagRow } from "@shenron/db/vfs/build";
import type { RagPort } from "@shenron/api/server";

/** The public site and its chat read the same current editorial index as the bot. */
export function createShenronRagPort(env: EnvSource, fetcher?: typeof fetch): RagPort {
  const client = new ShenronComputeClient({
    baseUrl: requireAiHttpUrl(env).href,
    token: requireAiHttpToken(env),
    ...(fetcher ? { fetcher } : {}),
  });
  return {
    async search(query) {
      if (query.lexicalOnly)
        throw new Error("The configured Shenron backend does not expose lexical-only retrieval");
      const result = await client.ragSearchWithMode(query.q, 20, {
        ...(query.lang ? { lang: query.lang } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.entity ? { entity: query.entity } : {}),
        ...(query.sourceId ? { sourceId: query.sourceId } : {}),
      });
      return {
        mode: result.mode,
        hits: result.results
          .filter((hit) =>
            isPublicRagRow({
              url: hit.url,
              metadata: { originSourceId: hit.originSourceId ?? hit.sourceId },
            }),
          )
          .filter((hit) => !query.lang || hit.lang === query.lang)
          .filter((hit) => !query.kind || hit.kind === query.kind)
          .filter(
            (hit) => !query.sourceId || (hit.originSourceId ?? hit.sourceId) === query.sourceId,
          )
          .slice(0, query.limit ?? 8)
          // oxlint-disable-next-line oxc/no-map-spread -- immutable copy intended
          .map((hit) => ({
            // Legacy numeric document IDs retain their identity. Opaque PostgreSQL IDs have
            // no SQLite rowid: use the bot compatibility sentinel, never a ranking ordinal.
            rowid: Number(hit.sourceId?.match(/^shenron:(\d+)$/)?.[1] ?? -1),
            title: hit.title,
            url: hit.url,
            kind: hit.kind,
            snippet: hit.snippet,
            score: hit.score,
            ...((hit.originSourceId ?? hit.sourceId)
              ? { sourceId: hit.originSourceId ?? hit.sourceId }
              : {}),
            ...(hit.lang ? { lang: hit.lang } : {}),
            ...(hit.content ? { content: hit.content } : {}),
          })),
      };
    },
  };
}
