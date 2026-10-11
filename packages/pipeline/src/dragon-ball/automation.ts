// SPDX-License-Identifier: Apache-2.0
/** Product checkpoints only; Aphrody owns acquisition, execution and native queues. */
import { Database } from "bun:sqlite";
import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import type { AphrodyWebJobs, NativeMcpTransport } from "../aphrody/jobs";
import {
  auditDatasetCoverage,
  datasetCatalogSchema,
  digest,
  type DatasetManifest,
  type VerifiedDataset,
} from "./source-coverage";

export type AutomationStage =
  | "inventory"
  | "collect"
  | "rag-ingest"
  | "rag-verify"
  | "dataset-prepare"
  | "train"
  | "heldout-verify";
export interface AutomationContext {
  /** The owner must deduplicate this key, including a retry after a lost receipt. */
  key: string;
  sourceId: string;
  inputDigest: string;
  stage: AutomationStage;
  signal?: AbortSignal;
}
export type StageOutcome<T> =
  | { state: "completed"; value: T }
  | { state: "pending" | "blocked"; code: string };
export class AutomationBlocked extends Error {
  constructor(readonly code: string) {
    super(code);
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(code)) throw new TypeError("Invalid blocker code");
  }
}
export interface CollectionPlan {
  family: DatasetManifest["family"];
  datasetId: string;
  /** Digest of the reviewed acquisition revision, not a path or credential. */
  revision: string;
  args: readonly string[];
  approved: boolean;
  rightsApproved: boolean;
  editorialTarget: DatasetManifest["editorialTarget"];
}
export interface CollectionProof {
  host: string;
  remoteId: string;
}
export interface RagProof {
  sourceDigest: string;
  documents: number;
  indexed: boolean;
  vectorIndexed: boolean;
}
export interface RetrievalProof extends RagProof {
  verified: boolean;
  retrieval: "hybrid" | "lexical";
  verifiedAt: number;
}
export interface PreparedDataset {
  sourceDigest: string;
  datasetDigest: string;
  goldDigest: string;
  approved: boolean;
  compatible: boolean;
  goldDisjoint: boolean;
}
export interface TrainingArtifact {
  datasetDigest: string;
  modelDigest: string;
  host: string;
}
export interface HeldoutProof {
  modelDigest: string;
  goldDigest: string;
  passed: boolean;
}
/** Ports execute existing native owners; no CLI fallback or implicit training provider. */
export interface DragonBallAutomationPorts {
  collect?: (
    plan: CollectionPlan,
    context: AutomationContext,
  ) => Promise<StageOutcome<CollectionProof>>;
  ingest?: (source: VerifiedDataset, context: AutomationContext) => Promise<StageOutcome<RagProof>>;
  verifyRag?: (
    source: VerifiedDataset,
    context: AutomationContext,
  ) => Promise<StageOutcome<RetrievalProof>>;
  prepareDataset?: (
    source: VerifiedDataset,
    context: AutomationContext,
  ) => Promise<StageOutcome<PreparedDataset>>;
  training?: {
    capability: {
      nativeInProcess: boolean;
      handlerReady: boolean;
      authenticated: boolean;
      hardwareQualified: boolean;
      host: string;
    };
    train: (
      dataset: PreparedDataset,
      context: AutomationContext,
    ) => Promise<StageOutcome<TrainingArtifact>>;
  };
  verifyHeldout?: (
    artifact: TrainingArtifact,
    dataset: PreparedDataset,
    context: AutomationContext,
  ) => Promise<StageOutcome<HeldoutProof>>;
}
export interface AutomationInput {
  catalog: unknown;
  /** Fresh verifyDataset results, read again after acquisition; checkpoints never approve content. */
  datasets: readonly VerifiedDataset[];
  collectionPlans?: readonly CollectionPlan[];
  editorialFrozen: boolean;
  asOf?: string;
  signal?: AbortSignal;
}
export interface AutomationCheckpoint {
  key: string;
  source_id: string;
  input_digest: string;
  stage: AutomationStage;
  state: "pending" | "blocked" | "completed";
  code: string | null;
  metadata: string | null;
}
const hash = (value: string) => /^[a-f0-9]{64}$/.test(value);
const sourceId = (family: string, id: string) => `${family}/${id}`;
const keyFor = (source: string, revision: string, stage: AutomationStage) =>
  `db:${digest(source)}:${revision}:${stage}`;
const completed = <T>(value: T): StageOutcome<T> => ({ state: "completed", value });
const requireProof = (valid: boolean, code: string): void => {
  if (!valid) throw new AutomationBlocked(code);
};

/** Existing MCP HTTP client handles authentication/session headers in native code. */
export function createNativeRagPorts(
  route: { config: string; server?: "aphrody" },
  transport: NativeMcpTransport = async (request, options) => {
    const owner = await import("@aphrody/shenron-native/web/pipeline");
    return owner.mcpTool(request, options);
  },
  now: () => number = Date.now,
): Required<Pick<DragonBallAutomationPorts, "ingest" | "verifyRag">> {
  if (!isAbsolute(route.config)) throw new TypeError("A protected absolute MCP config is required");
  const record = (value: unknown): Record<string, unknown> => {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new AutomationBlocked("invalid-native-rag-receipt");
    return value as Record<string, unknown>;
  };
  const call = async (tool: string, args: Record<string, unknown>, context: AutomationContext) => {
    const envelope = record(
      await transport(
        { config: route.config, server: route.server ?? "aphrody", tool, arguments: args },
        { signal: context.signal, timeoutMs: 30_000 },
      ),
    );
    const result = record(envelope.result);
    requireProof(result.isError !== true, "native-rag-request-rejected");
    const value =
      result.structuredContent ??
      JSON.parse(
        (Array.isArray(result.content) ? result.content : [])
          .map((item) => record(item))
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n"),
      );
    const data = record(value);
    if (data.error !== undefined) {
      const error = record(data.error);
      throw new AutomationBlocked(
        String(error.code) === "503" ? "rag-backend-unavailable" : "native-rag-request-rejected",
      );
    }
    return data;
  };
  const identity = (source: VerifiedDataset, itemId: string) =>
    `shenron:dataset:${source.manifest.family}:${source.manifest.id}:${digest(itemId)}`;
  const title = (source: VerifiedDataset, itemId: string) =>
    `${source.manifest.title.slice(0, 180)} ${itemId.slice(0, 32)}`;
  return {
    ingest: async (source, context) => {
      const items = source.manifest.items.filter((item) => !item.noText);
      for (const item of items) {
        const id = identity(source, item.id);
        const receipt = await call(
          "aphrody_shenron_rag_ingest",
          {
            sourceId: id,
            originSourceId: id,
            title: title(source, item.id),
            url: source.manifest.citation,
            content: item.text,
            kind: source.manifest.family,
            lang: item.lang,
          },
          context,
        );
        requireProof(
          receipt.sourceId === id &&
            receipt.indexed === true &&
            receipt.vectorIndexed === true &&
            receipt.retrieval === "hybrid",
          "rag-vector-proof-missing",
        );
      }
      return completed({
        sourceDigest: source.digest,
        documents: items.length,
        indexed: true,
        vectorIndexed: true,
      });
    },
    verifyRag: async (source, context) => {
      const items = source.manifest.items.filter((item) => !item.noText);
      for (const item of items) {
        const id = identity(source, item.id);
        const proof = await call(
          "aphrody_shenron_rag_search",
          {
            q: title(source, item.id).slice(0, 100),
            sourceId: id,
            kind: source.manifest.family,
            lang: item.lang,
            limit: 1,
          },
          context,
        );
        requireProof(
          proof.mode === "hybrid" &&
            Array.isArray(proof.results) &&
            proof.results.some((hit) => record(hit).sourceId === id),
          "rag-retrieval-proof-missing",
        );
      }
      return completed({
        sourceDigest: source.digest,
        documents: items.length,
        indexed: true,
        vectorIndexed: true,
        verified: true,
        retrieval: "hybrid" as const,
        verifiedAt: now(),
      });
    },
  };
}

/** Reuses native host placement and durable queue intents; never starts a subprocess. */
export function createNativeCollectionPort(
  jobs: AphrodyWebJobs,
): NonNullable<DragonBallAutomationPorts["collect"]> {
  return async (plan, context) => {
    const current = jobs.get(context.key);
    const receipt =
      current && current.remoteId !== null
        ? await jobs.refresh(context.key, context.signal)
        : await jobs.submit({ key: context.key, args: plan.args }, context.signal);
    if (["submitting", "queued", "running"].includes(receipt.state))
      return { state: "pending", code: "native-collection-pending" };
    if (receipt.state !== "succeeded")
      return { state: "blocked", code: "native-collection-failed" };
    const result = receipt.result;
    const record = (value: unknown): Record<string, unknown> =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const payload = record(result);
    const campaign = record(payload.campaign);
    const complete =
      plan.args[0] === "dragon-ball"
        ? campaign.schema === "aphrody-dragon-ball-crawl/v1" &&
          campaign.completed === true &&
          Array.isArray(campaign.errors) &&
          campaign.errors.length === 0
        : payload.complete === true;
    if (!complete) return { state: "blocked", code: "native-collection-incomplete" };
    requireProof(receipt.remoteId !== null, "native-collection-invalid-receipt");
    return completed({ host: receipt.host, remoteId: receipt.remoteId! });
  };
}

/** One product owner drives this ledger; ports own side effects and must be idempotent.
 * Only proof metadata is stored here. Corpus text, credentials and weights stay with their owners. */
export class DragonBallAutomation {
  private readonly db: Database;
  private running = false;
  constructor(
    ledgerPath: string,
    private readonly ports: DragonBallAutomationPorts,
    private readonly concurrency = 2,
    private readonly now: () => number = Date.now,
  ) {
    if (!isAbsolute(ledgerPath)) throw new TypeError("A private absolute ledger path is required");
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16)
      throw new RangeError("Automation concurrency must be 1..16");
    const directory = dirname(ledgerPath);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const parent = lstatSync(directory);
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      (process.platform !== "win32" && (parent.mode & 0o077) !== 0)
    )
      throw new Error("The checkpoint ledger requires a private directory (0700)");
    try {
      const file = lstatSync(ledgerPath);
      if (!file.isFile() || file.isSymbolicLink())
        throw new Error("The checkpoint ledger must be a regular file");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    this.db = new Database(ledgerPath, { create: true, strict: true });
    chmodSync(ledgerPath, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS dragon_ball_automation_checkpoints (
        key TEXT PRIMARY KEY, source_id TEXT NOT NULL, input_digest TEXT NOT NULL,
        stage TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','blocked','completed')),
        code TEXT, metadata TEXT
      );`);
  }
  checkpoints(): AutomationCheckpoint[] {
    return this.db
      .query<AutomationCheckpoint, []>(
        "SELECT * FROM dragon_ball_automation_checkpoints ORDER BY source_id,stage",
      )
      .all();
  }
  private async step<T>(
    source: string,
    revision: string,
    stage: AutomationStage,
    touched: Set<string>,
    signal: AbortSignal | undefined,
    operation: (context: AutomationContext) => Promise<StageOutcome<T>>,
    validate: (value: T) => T = (value) => value,
  ): Promise<T | undefined> {
    signal?.throwIfAborted();
    const key = keyFor(source, revision, stage);
    touched.add(key);
    this.db
      .query(
        "INSERT OR IGNORE INTO dragon_ball_automation_checkpoints(key,source_id,input_digest,stage,state) VALUES(?,?,?,?, 'pending')",
      )
      .run(key, source, revision, stage);
    const row = this.db
      .query<AutomationCheckpoint, [string]>(
        "SELECT * FROM dragon_ball_automation_checkpoints WHERE key=?",
      )
      .get(key)!;
    if (row.state === "completed") {
      const value = JSON.parse(row.metadata!) as T;
      return validate(value);
    }
    this.db
      .query("UPDATE dragon_ball_automation_checkpoints SET state='pending',code=NULL WHERE key=?")
      .run(key);
    let outcome: StageOutcome<T>;
    try {
      outcome = await operation({
        key,
        sourceId: source,
        inputDigest: revision,
        stage,
        ...(signal ? { signal } : {}),
      });
      if (outcome.state === "completed") outcome = completed(validate(outcome.value));
      else requireProof(/^[a-z][a-z0-9-]{0,63}$/.test(outcome.code), "invalid-port-receipt");
    } catch (error) {
      // Provider errors may contain credentials or corpus text. Persist only controlled codes.
      outcome = {
        state: "blocked",
        code:
          error instanceof AutomationBlocked
            ? error.code
            : signal?.aborted
              ? "operation-aborted"
              : "native-operation-unavailable",
      };
    }
    this.db
      .query(
        "UPDATE dragon_ball_automation_checkpoints SET state=?,code=?,metadata=? WHERE key=? AND state!='completed'",
      )
      .run(
        outcome.state,
        outcome.state === "completed" ? null : outcome.code,
        outcome.state === "completed" ? JSON.stringify(outcome.value) : null,
        key,
      );
    return outcome.state === "completed" ? outcome.value : undefined;
  }
  async run(input: AutomationInput) {
    if (this.running) throw new Error("An automation pass is already running");
    this.running = true;
    const touched = new Set<string>();
    try {
      const catalog = datasetCatalogSchema.parse(input.catalog);
      const coverage = auditDatasetCoverage(catalog, input.datasets, input);
      await this.step(
        "inventory",
        digest(JSON.stringify(coverage)),
        "inventory",
        touched,
        input.signal,
        async () =>
          completed({ gaps: coverage.gaps.length, coverageComplete: coverage.coverageComplete }),
      );
      const tasks: Array<() => Promise<void>> = [];
      for (const plan of input.collectionPlans ?? []) {
        requireProof(hash(plan.revision), "invalid-collection-revision");
        requireProof(
          /^[a-z0-9_]{1,64}$/.test(plan.datasetId) &&
            plan.args.length > 0 &&
            plan.args.length <= 256 &&
            ["dragon-ball", "crawl-index"].includes(plan.args[0] ?? "") &&
            plan.args.every((arg) => typeof arg === "string" && !arg.includes("\0")),
          "invalid-collection-intent",
        );
        const source = sourceId(plan.family, plan.datasetId);
        const revision = digest(JSON.stringify({ revision: plan.revision, args: plan.args }));
        const existing = coverage.datasets.find(
          (item) => item.id === plan.datasetId && item.family === plan.family,
        );
        if (existing?.coverageComplete) continue;
        tasks.push(async () => {
          const families = catalog.families.filter((item) => item.family === plan.family);
          const blocker = !(
            families.length === 1 &&
            families[0]!.enumerationReviewed &&
            families[0]!.expectedIds.includes(plan.datasetId) &&
            catalog.asOf === coverage.asOf
          )
            ? "collection-enumeration-unapproved"
            : !plan.approved || !plan.rightsApproved
              ? "collection-governance-unapproved"
              : input.editorialFrozen && plan.editorialTarget === "databook"
                ? "editorial-freeze"
                : null;
          if (blocker) {
            await this.deny(source, revision, "collect", blocker, touched, input.signal);
            return;
          }
          await this.step(
            source,
            revision,
            "collect",
            touched,
            input.signal,
            async (context) => {
              requireProof(this.ports.collect !== undefined, "native-collection-unavailable");
              return this.ports.collect!(plan, context);
            },
            (proof) => {
              requireProof(
                /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(proof.host) &&
                  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(proof.remoteId),
                "native-collection-invalid-receipt",
              );
              return { host: proof.host, remoteId: proof.remoteId };
            },
          );
        });
      }
      for (const report of coverage.datasets) {
        const source = input.datasets.find(
          (item) => item.manifest.id === report.id && item.manifest.family === report.family,
        )!;
        tasks.push(async () => this.advance(source, report, input, touched));
      }
      let cursor = 0;
      const lanes = await Promise.allSettled(
        Array.from({ length: Math.min(this.concurrency, tasks.length) }, async () => {
          while (cursor < tasks.length) await tasks[cursor++]!();
        }),
      );
      for (const lane of lanes) if (lane.status === "rejected") throw lane.reason;
      const checkpoints = this.checkpoints().filter((item) => touched.has(item.key));
      return {
        coverage,
        checkpoints,
        complete:
          coverage.trainingReady &&
          coverage.datasets.length > 0 &&
          coverage.datasets.every((item) =>
            checkpoints.some(
              (checkpoint) =>
                checkpoint.source_id === sourceId(item.family, item.id) &&
                checkpoint.stage === "heldout-verify" &&
                checkpoint.state === "completed",
            ),
          ),
      };
    } finally {
      this.running = false;
    }
  }
  private async deny(
    source: string,
    revision: string,
    stage: AutomationStage,
    code: string,
    touched: Set<string>,
    signal?: AbortSignal,
  ) {
    await this.step(source, digest(`${revision}:${code}`), stage, touched, signal, async () => {
      throw new AutomationBlocked(code);
    });
  }
  private async advance(
    source: VerifiedDataset,
    report: ReturnType<typeof auditDatasetCoverage>["datasets"][number],
    input: AutomationInput,
    touched: Set<string>,
  ): Promise<void> {
    const id = sourceId(report.family, report.id);
    const step = <T>(
      stage: AutomationStage,
      operation: (context: AutomationContext) => Promise<StageOutcome<T>>,
      validate?: (value: T) => T,
      revision = report.digest,
    ) => this.step(id, revision, stage, touched, input.signal, operation, validate);
    // Current governance is checked before reading any cached side-effect proof.
    if (!report.ragReady) {
      await this.deny(
        id,
        report.digest,
        "rag-ingest",
        input.editorialFrozen && source.manifest.editorialTarget === "databook"
          ? "editorial-freeze"
          : "rag-governance-unapproved",
        touched,
        input.signal,
      );
      return;
    }
    const validateRag = (proof: RagProof): RagProof => {
      requireProof(
        proof.sourceDigest === report.digest &&
          proof.indexed === true &&
          proof.vectorIndexed === true &&
          Number.isInteger(proof.documents) &&
          proof.documents === source.manifest.items.filter((item) => !item.noText).length &&
          proof.documents > 0,
        "rag-vector-proof-missing",
      );
      return {
        sourceDigest: proof.sourceDigest,
        indexed: true,
        vectorIndexed: true,
        documents: proof.documents,
      };
    };
    const ingest = await step(
      "rag-ingest",
      async (context) => {
        if (!this.ports.ingest) throw new AutomationBlocked("native-rag-ingest-unavailable");
        return this.ports.ingest(source, context);
      },
      validateRag,
    );
    if (!ingest) return;
    const fresh = (proof: RetrievalProof) =>
      Number.isSafeInteger(proof.verifiedAt) &&
      proof.verifiedAt <= this.now() &&
      this.now() - proof.verifiedAt < 3_600_000;
    const retrieval = await step(
      "rag-verify",
      async (context) => {
        if (!this.ports.verifyRag)
          throw new AutomationBlocked("native-rag-verification-unavailable");
        return this.ports.verifyRag(source, context);
      },
      (proof): RetrievalProof => {
        const rag = validateRag(proof);
        requireProof(
          proof.verified === true && proof.retrieval === "hybrid" && fresh(proof),
          "rag-retrieval-proof-missing",
        );
        return { ...rag, verified: true, retrieval: "hybrid", verifiedAt: proof.verifiedAt };
      },
      digest(`${report.digest}:${Math.floor(this.now() / 3_600_000)}`),
    );
    if (!retrieval) return;
    if (!report.trainingReady) {
      await this.deny(
        id,
        report.digest,
        "dataset-prepare",
        "training-governance-unapproved",
        touched,
        input.signal,
      );
      return;
    }
    const dataset = await step(
      "dataset-prepare",
      async (context) => {
        if (!this.ports.prepareDataset)
          throw new AutomationBlocked("native-dataset-preparation-unavailable");
        return this.ports.prepareDataset(source, context);
      },
      (proof) => {
        requireProof(
          proof.sourceDigest === report.digest &&
            hash(proof.datasetDigest) &&
            hash(proof.goldDigest) &&
            proof.datasetDigest !== proof.goldDigest &&
            proof.approved === true &&
            proof.compatible === true &&
            proof.goldDisjoint === true,
          "dataset-gold-proof-missing",
        );
        return {
          sourceDigest: proof.sourceDigest,
          datasetDigest: proof.datasetDigest,
          goldDigest: proof.goldDigest,
          approved: true,
          compatible: true,
          goldDisjoint: true,
        };
      },
    );
    if (!dataset) return;
    if (!fresh(retrieval)) {
      await this.deny(
        id,
        report.digest,
        "rag-verify",
        "rag-verification-stale",
        touched,
        input.signal,
      );
      return;
    }
    const trainingRevision = digest(
      JSON.stringify({
        source: report.digest,
        dataset: dataset.datasetDigest,
        gold: dataset.goldDigest,
      }),
    );
    const training = this.ports.training;
    if (
      !training ||
      training.capability.nativeInProcess !== true ||
      training.capability.handlerReady !== true ||
      training.capability.authenticated !== true ||
      training.capability.hardwareQualified !== true ||
      training.capability.host !== "omar-wsl"
    ) {
      await this.deny(
        id,
        trainingRevision,
        "train",
        "native-training-host-unqualified",
        touched,
        input.signal,
      );
      return;
    }
    const artifact = await step(
      "train",
      (context) => training.train(dataset, context),
      (proof) => {
        requireProof(
          proof.datasetDigest === dataset.datasetDigest &&
            hash(proof.modelDigest) &&
            proof.host === "omar-wsl",
          "training-artifact-proof-missing",
        );
        return {
          datasetDigest: proof.datasetDigest,
          modelDigest: proof.modelDigest,
          host: proof.host,
        };
      },
      trainingRevision,
    );
    if (!artifact) return;
    await step(
      "heldout-verify",
      async (context) => {
        if (!this.ports.verifyHeldout)
          throw new AutomationBlocked("native-heldout-verification-unavailable");
        return this.ports.verifyHeldout(artifact, dataset, context);
      },
      (proof) => {
        requireProof(
          proof.passed === true &&
            proof.modelDigest === artifact.modelDigest &&
            proof.goldDigest === dataset.goldDigest,
          "heldout-verification-failed",
        );
        return { passed: true, modelDigest: proof.modelDigest, goldDigest: proof.goldDigest };
      },
      digest(JSON.stringify({ model: artifact.modelDigest, gold: dataset.goldDigest })),
    );
  }
  close(): void {
    if (this.running) throw new Error("Cannot close an automation pass in flight");
    this.db.close();
  }
  [Symbol.dispose](): void {
    this.close();
  }
}
