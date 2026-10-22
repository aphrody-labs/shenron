/**
 * XV2 step `portraits` (see `src/db/xv2/cli.ts`): `bun db:seed-xv2-portraits [--dry-run] [--target pg|sqlite]`.
 * Targets PostgreSQL `bot.*` by default; the reverse-sync carries it to the bot's SQLite.
 */
import { runXv2Cli } from "./xv2/cli";

await runXv2Cli(["--only", "portraits", ...Bun.argv.slice(2)]);
