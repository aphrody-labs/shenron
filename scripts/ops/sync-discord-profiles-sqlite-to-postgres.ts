#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Reconcile the bot's private Discord profile cache into PostgreSQL. */
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import postgres from "postgres";

type Profile = {
  user_id: string;
  username: string | null;
  avatar_hash: string | null;
  updated_at: number;
};

export function compareProfile(
  source: Profile,
  target: Profile,
): "same" | "source-newer" | "target-newer" {
  if (source.user_id !== target.user_id) throw new Error("Profile identity mismatch");
  if (!Number.isSafeInteger(source.updated_at) || source.updated_at < 0)
    throw new Error("Invalid source timestamp");
  const targetTime = Number(target.updated_at);
  if (!Number.isSafeInteger(targetTime) || targetTime < 0)
    throw new Error("Invalid target timestamp");
  if (source.updated_at > targetTime) return "source-newer";
  if (source.updated_at < targetTime) return "target-newer";
  if (source.username !== target.username || source.avatar_hash !== target.avatar_hash)
    throw new Error("Divergent profile at identical timestamp");
  return "same";
}

async function main() {
  const sqliteArg = process.argv.indexOf("--sqlite");
  const sourceArg = process.argv.indexOf("--source-id");
  const sqlitePath = process.argv[sqliteArg + 1];
  const sourceId = process.argv[sourceArg + 1];
  const apply = process.argv.includes("--apply");
  if (sqliteArg < 0 || !sqlitePath || sqlitePath.startsWith("--"))
    throw new Error("--sqlite required");
  if (sourceArg < 0 || !sourceId || !/^[a-z0-9][a-z0-9-]{5,80}$/.test(sourceId))
    throw new Error("--source-id required");
  if (apply && process.platform !== "linux") throw new Error("Apply requires Linux DBFR");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required from protected store");

  const db = new Database(resolve(sqlitePath), { readonly: true, create: false });
  let rows: Profile[];
  try {
    db.exec("BEGIN");
    rows = db
      .query<Profile, []>(
        "SELECT user_id, username, avatar_hash, updated_at FROM discord_user_profiles ORDER BY user_id",
      )
      .all();
    db.exec("COMMIT");
  } finally {
    db.close();
  }

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const report = {
    source: rows.length,
    same: 0,
    inserted: 0,
    updated: 0,
    targetNewer: 0,
    pending: 0,
  };
  try {
    const table = await sql`SELECT to_regclass('bot.discord_user_profiles') AS name`;
    if (!table[0]?.name)
      throw new Error("Infra migration for bot.discord_user_profiles is missing");
    for (const row of rows) {
      if (!/^\d{17,20}$/.test(row.user_id)) throw new Error("Invalid Discord profile ID");
      const found = await sql<Profile[]>`SELECT user_id, username, avatar_hash, updated_at
        FROM bot.discord_user_profiles WHERE user_id = ${row.user_id}`;
      const relation = found.length ? compareProfile(row, found[0]) : "missing";
      if (relation === "same") {
        report.same++;
        continue;
      }
      if (relation === "target-newer") {
        report.targetNewer++;
        continue;
      }
      if (!apply) {
        report.pending++;
        continue;
      }
      await sql`INSERT INTO bot.discord_user_profiles
        (user_id, username, avatar_hash, updated_at, source_id)
        VALUES (${row.user_id}, ${row.username}, ${row.avatar_hash}, ${row.updated_at}, ${sourceId})
        ON CONFLICT (user_id) DO UPDATE SET
          username = EXCLUDED.username, avatar_hash = EXCLUDED.avatar_hash,
          updated_at = EXCLUDED.updated_at, source_id = EXCLUDED.source_id
        WHERE bot.discord_user_profiles.updated_at < EXCLUDED.updated_at`;
      const verified = await sql<Profile[]>`SELECT user_id, username, avatar_hash, updated_at
        FROM bot.discord_user_profiles WHERE user_id = ${row.user_id}`;
      if (verified.length !== 1) throw new Error("Profile readback missing");
      const after = compareProfile(row, verified[0]);
      if (after !== "same" && after !== "target-newer")
        throw new Error("Profile readback mismatch");
      if (relation === "missing") report.inserted++;
      else report.updated++;
    }
    console.log(JSON.stringify({ ok: true, apply, sourceId, profiles: report }));
  } finally {
    await sql.end();
  }
}

if (import.meta.main) await main();
