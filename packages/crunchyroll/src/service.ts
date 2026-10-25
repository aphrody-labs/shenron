// SPDX-License-Identifier: Apache-2.0
import { CrunchyrollClient } from "./client";
import { join } from "node:path";
import { homedir } from "node:os";
import { CRUNCHYROLL_SERIES_BY_SHENRON } from "../../media/src/crunchyroll-mapping";
import { importedCatalogue } from "./import-runtime";

export class CrunchyrollService {
  private client: CrunchyrollClient;
  private dbPath: string;

  constructor() {
    this.client = new CrunchyrollClient();
    this.dbPath = join(homedir(), "apps", "shenron-crunchyroll", "index.sqlite");
  }

  async resolveWatchUrl(params: {
    series?: string;
    number?: number;
    episodeId?: string;
  }): Promise<string | null> {
    if (params.episodeId) {
      const ep = await this.client.getEpisode(params.episodeId);
      return ep?.watchUrl || null;
    }
    const seriesId = params.series && CRUNCHYROLL_SERIES_BY_SHENRON[params.series];
    if (!seriesId || !Number.isSafeInteger(params.number) || (params.number ?? 0) < 1) return null;
    const imported = (await importedCatalogue())?.episodes.find(
      (episode) => episode.seriesId === seriesId && episode.episodeNumber === params.number,
    );
    if (imported) return imported.watchUrl;
    if (params.series === "DBS_BEERUS" && params.number === 1) {
      return "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys";
    }
    return null;
  }

  getClient(): CrunchyrollClient {
    return this.client;
  }
}
