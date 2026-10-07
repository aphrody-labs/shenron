// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { publicVfsProblems } from "../../apps/server/src/payload";

/** Fail before compiling a production server whose public knowledge groups would be disabled. */
export function requireProductionVfs(path: string, disabled: boolean): void {
  if (disabled) throw new Error("Production server requires a public VFS; --no-vfs is not allowed");
  if (!existsSync(path)) throw new Error(`Production public VFS is missing: ${path}`);
  const problems = publicVfsProblems(path);
  if (problems.length)
    throw new Error(`Production public VFS failed validation: ${problems.join("; ")}`);
  const db = new Database(path, { readonly: true });
  try {
    const count = (table: "wiki_entities" | "chunks") =>
      (db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    if (!count("wiki_entities"))
      throw new Error("Production public VFS requires editorial wiki rows");
    if (!count("chunks")) throw new Error("Production public VFS requires searchable RAG chunks");
  } finally {
    db.close();
  }
}
