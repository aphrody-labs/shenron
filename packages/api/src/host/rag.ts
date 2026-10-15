// SPDX-License-Identifier: Apache-2.0
import { isPublicRagRow } from "@aphrody/shenron-db/vfs/build";
import type { RagPort } from "../server";

/** A product-injected index still obeys the public editorial boundary. */
export function createPublicRagPort(port: RagPort): RagPort {
  return {
    async search(query) {
      const result = await port.search(query);
      return {
        ...result,
        hits: result.hits
          .filter((hit) =>
            isPublicRagRow({ url: hit.url, metadata: { originSourceId: hit.sourceId } }),
          )
          .slice(0, query.limit ?? 8),
      };
    },
  };
}
