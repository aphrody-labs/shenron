/**
 * XV2 step `char-techniques` (see `src/db/xv2/cli.ts`): `bun db:seed-xv2-char-techniques [--dry-run] [--target pg|sqlite]`.
 * Targets PostgreSQL `bot.*` by default; the reverse-sync carries it to the bot's SQLite.
 */
import { runXv2Cli } from "./xv2/cli";

await runXv2Cli(["--only", "char-techniques", ...Bun.argv.slice(2)]);
