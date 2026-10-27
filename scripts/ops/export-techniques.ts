import { runRemoteSql } from "./remote-sql";
import * as fs from "fs";

async function main() {
  const jsonRaw = runRemoteSql("SELECT json_agg(t) FROM (SELECT id, slug, name, type, image, creator_id, debut_chapter_id, debut_episode_id FROM bot.db_techniques ORDER BY id) t;");
  // Find json part
  const match = jsonRaw.match(/\[.*\]/s);
  if (!match) {
    console.error("Failed to parse json");
    return;
  }
  fs.writeFileSync("scripts/ops/all_techniques.json", match[0]);
  console.log("Successfully wrote all_techniques.json");
}

main();
