#!/usr/bin/env bun
/** Retire les variantes sans preuve manga/databook (synopsis seuls). */
import postgres from "postgres";

const appliquer = process.argv.includes("--appliquer");
if (appliquer)
  throw new Error(
    "Legacy retirement apply is disabled; review primary evidence and use the official wiki administration API",
  );
async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const env = await Bun.file(".env.remote-db")
    .text()
    .catch(() => "");
  const line = env.split("\n").findLast((entry) => entry.startsWith("REMOTE_DATABASE_URL="));
  const value = line
    ?.slice("REMOTE_DATABASE_URL=".length)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!value) throw new Error("DATABASE_URL introuvable");
  return value;
}

const sql = postgres(await databaseUrl(), { max: 1 });
try {
  const all = await sql.unsafe(
    "select id,character_id,slug,form,power_level,evidence from bot.db_character_variants where visible=true order by id",
  );
  const rows = all.filter(
    (row) =>
      row.evidence?.methode === "synopsis-episodes" &&
      (!Array.isArray(row.evidence?.tomes) || row.evidence.tomes.length === 0),
  );
  console.log(
    JSON.stringify(
      {
        mode: "SIMULATION",
        count: rows.length,
        sample: rows.slice(0, 10),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
