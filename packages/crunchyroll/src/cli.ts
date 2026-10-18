#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { CrunchyrollClient } from "./client";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";
  const client = new CrunchyrollClient();

  switch (command) {
    case "status": {
      console.log(JSON.stringify({
        authenticated: client.isAuthenticated(),
        hasCookies: client.hasCookies(),
        hasToken: !!client.getBearerToken(),
        accountId: client.getAccountId() || null
      }, null, 2));
      break;
    }
    case "search": {
      const q = args[1] || "";
      const results = await client.search(q);
      console.log(JSON.stringify(results, null, 2));
      break;
    }
    case "series": {
      const id = args[1] || "DBS_BEERUS";
      const series = await client.getKnownSeries(id);
      console.log(JSON.stringify(series, null, 2));
      break;
    }
    case "episode": {
      const id = args[1] || "GE00389313JAJP";
      const ep = await client.getEpisode(id);
      console.log(JSON.stringify(ep, null, 2));
      break;
    }
    case "resolve": {
      const id = args[1];
      const ep = await client.getEpisode(id);
      if (ep?.watchUrl) {
        console.log(ep.watchUrl);
      } else {
        console.error("Episode not found or no watch URL.");
        process.exit(1);
      }
      break;
    }
    case "help":
    default:
      console.log(`
crunchyroll-cli: Headless Crunchyroll CLI & Resolver for Shenron

Usage:
  crunchyroll-cli status               Check session/token authentication state
  crunchyroll-cli search <query>       Search series and episodes
  crunchyroll-cli series <series_id>   Get series metadata (e.g. DBS_BEERUS, GT00389311)
  crunchyroll-cli episode <episode_id> Get episode metadata (e.g. GE00389313JAJP)
  crunchyroll-cli resolve <episode_id> Output canonical direct watch URL
  crunchyroll-cli help                 Show this help message
`);
      break;
  }
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
