/**
 * Typed access to the private DBXV2 database (hybrid search, files, characters, messages).
 * The logic lives in `@aphrody/shenron-db/dbxv2`; this module only re-exports it and adds the
 * environment gating. The database is a local private file (`DBXV2_DB_PATH`), never shipped.
 */
import {
  openDbxv2Db,
  type Dbxv2Db,
  type Dbxv2File,
  type OpenDbxv2Options,
} from "@aphrody/shenron-db/dbxv2";
import {
  currentEnv,
  dbxv2DbPath,
  isPublicContext,
  describeDisabledReason,
  type Dbxv2EnvInput,
} from "./env";
import { Dbxv2DisabledError } from "./errors";
import type { Dbxv2Ref } from "./refs";

export {
  DBXV2_LANGS,
  decodeCms,
  decodeMsg,
  openDbxv2Db,
  type CmsEntry,
  type Dbxv2Db,
  type Dbxv2File,
  type Dbxv2FileQuery,
  type Dbxv2Lang,
  type Dbxv2Message,
  type Dbxv2SearchOptions,
  type Dbxv2SearchResult,
  type MsgEntry,
  type OpenDbxv2Options,
} from "@aphrody/shenron-db/dbxv2";

/** Opens the database at `DBXV2_DB_PATH` (read-only by default); throws when disabled. */
export function openDbxv2DbFromEnv(
  env: Dbxv2EnvInput = currentEnv(),
  options: OpenDbxv2Options = {},
): Dbxv2Db {
  const blocked = isPublicContext(env);
  if (blocked) throw new Dbxv2DisabledError(describeDisabledReason(blocked));
  const path = dbxv2DbPath(env);
  if (!path) throw new Dbxv2DisabledError("DBXV2_DB_PATH is not set");
  return openDbxv2Db(path, { readOnly: true, ...options });
}

/** Reference usable with the server client and the proxy URLs. */
export function refOfFile(file: Pick<Dbxv2File, "cpk" | "path">): Dbxv2Ref {
  return { cpk: file.cpk, path: file.path };
}

/** Every file reference of the database matching `query`, paged internally. */
export function* iterateDbxv2Refs(
  db: Dbxv2Db,
  query: { readonly format?: string; readonly kind?: string; readonly cpk?: string } = {},
): Generator<Dbxv2Ref> {
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = db.files({ ...query, limit, offset });
    for (const file of page) yield refOfFile(file);
    if (page.length < limit) return;
  }
}
