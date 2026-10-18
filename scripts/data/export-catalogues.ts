// SPDX-License-Identifier: Apache-2.0
/**
 * Exports the real catalogues of dragonballfr.com (episodes, films, manga volumes, databooks)
 * from the public API, paginated to the end, as JSON and CSV with a manifest.
 *
 * Read-only: only GET requests, one at a time with a polite delay. Output lands in
 * var/reports/catalogues/ (ignored by Git) — a local download, not a published page.
 *
 * Usage: bun scripts/data/export-catalogues.ts [--origin URL] [--out DIR] [--delay MS]
 */
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const option = (name: string, fallback: string) => {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? fallback : (Bun.argv[index + 1] ?? fallback);
};
const origin = new URL(option("--origin", "https://dragonballfr.com")).origin;
const out = option("--out", "var/reports/catalogues");
const delay = Number(option("--delay", "150"));

type Row = Record<string, unknown>;

async function getJson(path: string, attempts = 3): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(new URL(path, origin), {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${path}`);
      await Bun.sleep(delay);
      return await response.json();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await Bun.sleep(1000 * attempt);
    }
  }
}

/** Reads every page of a list endpoint that returns `{ total, ... }` with limit/offset. */
async function allPages(path: string, key: string, limit: number): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += limit) {
    const page = (await getJson(
      `${path}${path.includes("?") ? "&" : "?"}limit=${limit}&offset=${offset}`,
    )) as {
      total: number;
      [name: string]: unknown;
    };
    const items = (page[key] as Row[]) ?? [];
    rows.push(...items);
    if (items.length === 0 || rows.length >= page.total) return rows;
  }
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return (
    [
      columns.join(","),
      ...rows.map((row) => columns.map((column) => cell(row[column])).join(",")),
    ].join("\n") + "\n"
  );
}

async function write(name: string, rows: Row[], manifest: Row[]) {
  const json = JSON.stringify(rows, null, 1);
  const csv = toCsv(rows);
  await Bun.write(join(out, `${name}.json`), json);
  await Bun.write(join(out, `${name}.csv`), csv);
  manifest.push({
    dataset: name,
    records: rows.length,
    json: `${name}.json`,
    csv: `${name}.csv`,
    sha256: createHash("sha256").update(json).digest("hex"),
  });
  console.log(`${name}: ${rows.length}`);
}

async function main() {
  await mkdir(out, { recursive: true });
  const manifest: Row[] = [];
  const fetchedAt = new Date().toISOString();

  // Films: a single list, no pagination.
  const movies = ((await getJson("/api/movies")) as { movies: Row[] }).movies;
  await write("movies", movies, manifest);

  // Episodes: one series summary, then every series paginated.
  const summary = (await getJson("/api/episodes")) as {
    series: { series: string; count: number }[];
  };
  const episodes: Row[] = [];
  for (const series of summary.series) {
    episodes.push(...(await allPages(`/api/episodes?series=${series.series}`, "episodes", 200)));
  }
  await write("episodes", episodes, manifest);

  // Manga: every volume of the coverage list (scope and completeness fields are kept).
  const coverage = (await getJson("/api/manga/coverage")) as {
    volumes: Row[];
    totals: Row;
    complete: boolean;
  };
  await write("manga-volumes", coverage.volumes, manifest);

  // Databooks: every item, 200 per page (the server maximum).
  const databooks = await allPages("/api/databooks", "items", 200);
  await write("databooks", databooks, manifest);

  await Bun.write(
    join(out, "manifest.json"),
    JSON.stringify(
      {
        origin,
        fetchedAt,
        mangaCoverage: { complete: coverage.complete, totals: coverage.totals },
        datasets: manifest,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(manifest.map(({ dataset, records }) => ({ dataset, records }))));
}

if (import.meta.main) await main();
