/**
 * CLI of the XV2 content seed (`bun db:seed-xv2-all`, `bun db:seed-xv2-<step>`).
 *
 *   --target pg       (default) PostgreSQL `bot.*`, URL from resolveBotDatabaseUrl
 *   --target sqlite   SQLite at DATABASE_PATH (local replica or copy); requires
 *                     ALLOW_SQLITE_WIKI_WRITE=1, as the reverse-sync overwrites
 *                     these tables on a live replica
 *   --dry-run         plan and print counts, write nothing
 *   --only a,b        steps among techniques, characters, char-meta, portraits,
 *                     transformations, char-techniques (default: all)
 *
 * Runs from `apps/bot` (the assets are read from `./assets/dbz`).
 */
import { Database } from "bun:sqlite";
import postgres from "postgres";
import { resolveBotDatabaseUrl } from "../pg-url";
import { applyXv2Pg, applyXv2PlanSqlite, readXv2SnapshotPg, readXv2SnapshotSqlite } from "./apply";
import {
  loadXv2Source,
  planXv2Content,
  selectXv2Steps,
  summarizeXv2Plan,
  XV2_STEPS,
  type Xv2Plan,
  type Xv2Step,
} from "./content";

export interface Xv2CliArgs {
  target: "pg" | "sqlite";
  dryRun: boolean;
  steps: Xv2Step[];
}

export function parseXv2Args(argv: string[]): Xv2CliArgs {
  const args: Xv2CliArgs = { target: "pg", dryRun: false, steps: [...XV2_STEPS] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = (name: string) =>
      arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : (argv[++i] ?? "");
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--target" || arg.startsWith("--target=")) {
      const target = value("--target");
      if (target !== "pg" && target !== "sqlite") throw new Error(`--target: pg | sqlite`);
      args.target = target;
    } else if (arg === "--only" || arg.startsWith("--only=")) {
      const steps = value("--only").split(",").filter(Boolean);
      const unknown = steps.filter((s) => !(XV2_STEPS as readonly string[]).includes(s));
      if (unknown.length || !steps.length)
        throw new Error(`--only: ${XV2_STEPS.join(", ")} (inconnu : ${unknown.join(", ")})`);
      args.steps = steps as Xv2Step[];
    } else throw new Error(`argument inconnu : ${arg}`);
  }
  return args;
}

function report(plan: Xv2Plan, label: string): void {
  console.log(`${label} ${JSON.stringify(summarizeXv2Plan(plan))}`);
  if (plan.unresolvedSkills.length)
    console.log(`  compétences sans technique : ${[...new Set(plan.unresolvedSkills)].join(", ")}`);
  if (plan.unlinkedForms.length)
    console.log(`  formes sans personnage de base : ${plan.unlinkedForms.join(", ")}`);
}

export async function runXv2Cli(argv: string[]): Promise<void> {
  const args = parseXv2Args(argv);
  const source = loadXv2Source();
  const makePlan = (snapshot: Parameters<typeof planXv2Content>[0]) =>
    selectXv2Steps(planXv2Content(snapshot, source), args.steps);
  console.log(`XV2 ${source.catalog.source} → ${args.target} [${args.steps.join(", ")}]`);

  if (args.target === "sqlite") {
    const path = Bun.env.DATABASE_PATH ?? "./data/bot.db";
    if (!args.dryRun && !Bun.env.ALLOW_SQLITE_WIKI_WRITE) {
      throw new Error(
        "SQLite : réplica écrasé par le reverse-sync PostgreSQL → SQLite. " +
          "Cibler PostgreSQL (--target pg) ou poser ALLOW_SQLITE_WIKI_WRITE=1 pour une copie locale.",
      );
    }
    const sqlite = new Database(path, { readonly: args.dryRun, create: false });
    try {
      sqlite.exec("PRAGMA busy_timeout = 15000");
      const plan = makePlan(readXv2SnapshotSqlite(sqlite));
      report(plan, args.dryRun ? "plan (dry-run)" : "écrit");
      if (!args.dryRun) applyXv2PlanSqlite(sqlite, plan);
    } finally {
      sqlite.close();
    }
    return;
  }

  const url = resolveBotDatabaseUrl();
  if (!url)
    throw new Error("PostgreSQL introuvable (DATABASE_URL ou fichiers de repli de pg-url).");
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    if (args.dryRun) {
      report(makePlan(await readXv2SnapshotPg(sql)), "plan (dry-run)");
      return;
    }
    const { plan, revisions } = await applyXv2Pg(sql, makePlan);
    report(plan, "écrit");
    console.log(`  ${revisions} révisions public.wiki_revisions (editorId xv2-content)`);
  } finally {
    await sql.end();
  }
}
