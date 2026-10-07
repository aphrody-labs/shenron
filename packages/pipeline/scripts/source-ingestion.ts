// SPDX-License-Identifier: Apache-2.0
import { verifySource, type SourceManifest } from "./source-coverage";

/** Adapters must use existing editorial transactions/revisions and Aphrody ingestion. */
export interface IngestionPorts {
  deposit(source: SourceManifest, manifestDigest: string): Promise<void>;
  verifyDatabase(source: SourceManifest, manifestDigest: string): Promise<boolean>;
  syncRag(source: SourceManifest, manifestDigest: string): Promise<void>;
  verifyRag(source: SourceManifest, manifestDigest: string): Promise<boolean>;
  checkpoint(stage: "database" | "rag", manifestDigest: string): Promise<void>;
}

/** Resume from live evidence, never from a previous checkpoint alone. */
export async function ingestSource(
  input: unknown,
  root: string,
  ports: IngestionPorts,
  options: { apply: boolean; editorialFrozen: boolean },
) {
  const report = await verifySource(input, root);
  if (!report.ready)
    throw new Error(`Source ${report.source.id} incomplete: ${report.issues.join(", ")}`);
  if (!options.apply)
    return { id: report.source.id, ready: true, complete: false, digest: report.digest };
  if (options.editorialFrozen) throw new Error("Editorial freeze forbids source deposition");
  const { source, digest } = report;
  if (!(await ports.verifyDatabase(source, digest))) {
    await ports.deposit(source, digest);
    if (!(await ports.verifyDatabase(source, digest)))
      throw new Error("Database deposition did not verify");
  }
  await ports.checkpoint("database", digest);
  if (!(await ports.verifyRag(source, digest))) {
    await ports.syncRag(source, digest);
    if (!(await ports.verifyRag(source, digest))) throw new Error("RAG deposition did not verify");
  }
  // Recheck editorial state after remote work: concurrent changes invalidate completion.
  if (!(await ports.verifyDatabase(source, digest)))
    throw new Error("Database changed during RAG sync");
  await ports.checkpoint("rag", digest);
  return { id: source.id, ready: true, complete: true, digest };
}
