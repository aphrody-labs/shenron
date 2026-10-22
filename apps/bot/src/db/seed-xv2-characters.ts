/**
 * XV2 step `characters` (see `src/db/xv2/cli.ts`): `bun db:seed-xv2-characters [--dry-run] [--target pg|sqlite]`.
 * Targets PostgreSQL `bot.*` by default; the reverse-sync carries it to the bot's SQLite.
 */
import { runXv2Cli } from "./xv2/cli";

await runXv2Cli(["--only", "characters", ...Bun.argv.slice(2)]);
