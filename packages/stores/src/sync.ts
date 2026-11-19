// SPDX-License-Identifier: Apache-2.0
import { appstore } from "./appstore";
import { fdroid } from "./fdroid";
import { microsoft } from "./microsoft";
import { isDragonBall } from "./relevance";
import { steam } from "./steam";
import { STORE_IDS, type StoreConnector, type StoreId, type StoreListing } from "./types";

export const CONNECTORS: Record<StoreId, StoreConnector> = { steam, appstore, fdroid, microsoft };

export const DEFAULT_TERMS = ["dragon ball", "ドラゴンボール"];
export const DEFAULT_REGIONS = ["us", "jp", "fr"];

export interface SyncOptions {
  stores?: readonly StoreId[];
  regions?: readonly string[];
  terms?: readonly string[];
  /** Called for a connector failure; the run continues with the other stores. */
  onError?: (store: StoreId, region: string, error: unknown) => void;
}

/** Search every store, region and term, keep Dragon Ball listings, one per store, product and region. */
export async function collectListings(options: SyncOptions = {}): Promise<StoreListing[]> {
  const stores = options.stores ?? STORE_IDS;
  const regions = options.regions ?? DEFAULT_REGIONS;
  const terms = options.terms ?? DEFAULT_TERMS;
  const seen = new Map<string, StoreListing>();
  await Promise.all(
    stores.flatMap((store) =>
      // F-Droid has no regions: one pass is enough.
      (store === "fdroid" ? ["all"] : regions).flatMap((region) =>
        terms.map(async (term) => {
          try {
            for (const listing of await CONNECTORS[store].search(term, { region })) {
              if (isDragonBall(listing)) seen.set(`${listing.store}:${listing.storeId}:${listing.region}`, listing);
            }
          } catch (error) {
            options.onError?.(store, region, error);
          }
        }),
      ),
    ),
  );
  return [...seen.values()].sort((a, b) => a.store.localeCompare(b.store) || a.title.localeCompare(b.title) || a.region.localeCompare(b.region));
}
