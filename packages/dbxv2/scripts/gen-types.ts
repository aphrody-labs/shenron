#!/usr/bin/env bun
/**
 * Generates `var/dbxv2/dbxv2.d.ts` from the private index.
 *
 *   bun packages/dbxv2/scripts/gen-types.ts [--out <file>] [--cpk NAME ...] [--from-db]
 *
 * Source: the private server (DBXV2_SERVER_URL + DBXV2_TOKEN) or, with --from-db, the private
 * database (DBXV2_DB_PATH). The output stays out of Git (var/).
 */
import { Dbxv2Client } from "../src/client";
import { iterateDbxv2Refs, openDbxv2DbFromEnv } from "../src/db";
import {
  collectKnownRefs,
  defaultDeclarationsPath,
  renderDeclarations,
  writeDeclarations,
} from "../src/declarations";
import { dbxv2Status, describeDisabledReason, type Dbxv2EnvInput } from "../src/env";
import type { Dbxv2Ref } from "../src/refs";

const args = Bun.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const values = (name: string): string[] =>
  args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]!] : []));

const env = process.env as Dbxv2EnvInput;
const out = values("--out")[0] ?? defaultDeclarationsPath(process.cwd());
let refs: Dbxv2Ref[];

if (flag("--from-db")) {
  const db = openDbxv2DbFromEnv(env);
  try {
    refs = [...iterateDbxv2Refs(db)];
  } finally {
    db.close();
  }
} else {
  const status = dbxv2Status(env);
  if (!status.enabled) {
    console.error(`DBXV2 disabled: ${describeDisabledReason(status.reason)}`);
    process.exit(2);
  }
  const cpks = values("--cpk");
  refs = await collectKnownRefs(new Dbxv2Client(status.config), cpks.length ? { cpks } : {});
}

const written = writeDeclarations(out, renderDeclarations(refs));
console.log(`${refs.length} entries -> ${written}`);
