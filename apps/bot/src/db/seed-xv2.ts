/**
 * All XV2 content steps in one transaction (see `src/db/xv2/cli.ts`):
 * `bun db:seed-xv2-all [--dry-run] [--target pg|sqlite] [--only a,b]`.
 */
import { runXv2Cli } from "./xv2/cli";

await runXv2Cli(Bun.argv.slice(2));
