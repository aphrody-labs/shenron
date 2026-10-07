// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AphrodyWebJobs, type NativeMcpTransport } from "../src/aphrody/jobs";
import {
  AutomationBlocked,
  DragonBallAutomation,
  createNativeCollectionPort,
  createNativeRagPorts,
  type AutomationContext,
  type AutomationInput,
  type DragonBallAutomationPorts,
  type StageOutcome,
} from "../src/dragon-ball/automation";
import { digest, verifyDataset, type DatasetManifest } from "../src/dragon-ball/source-coverage";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const asOf = "2026-10-07";
const done = <T>(value: T): StageOutcome<T> => ({ state: "completed", value });
const envelope = (value: unknown) => ({
  result: { content: [{ type: "text", text: JSON.stringify(value) }] },
});
async function fixture(family: DatasetManifest["family"] = "guides", count = 1) {
  const root = await mkdtemp(join(tmpdir(), "shenron-automation-"));
  roots.push(root);
  await writeFile(join(root, "page.bin"), "source bytes");
  const datasets = [];
  for (let n = 1; n <= count; n++) {
    const manifest: DatasetManifest = {
      version: 1,
      id: `fixture_${n}`,
      family,
      title: "Private source",
      citation: "https://www.shueisha.co.jp/",
      edition: {
        publisher: "Publisher",
        format: "digital",
        language: "ja",
        identifier: `fixture_${n}`,
      },
      unit: "document",
      asOf,
      enumerationEvidence: "https://www.shueisha.co.jp/",
      enumerationReviewed: true,
      expectedIds: ["page_1"],
      editorialTarget: family === "databooks" ? "databook" : "none",
      rights: {
        basis: "permission",
        evidence: "PRIVATE RIGHTS EVIDENCE",
        ragPermitted: true,
        trainingPermitted: true,
        publicImagesPermitted: false,
      },
      trainingReview: "approved",
      items: [
        {
          id: "page_1",
          asset: "page.bin",
          sha256: digest("source bytes"),
          review: "approved",
          text: "PRIVATE SOURCE TEXT",
          noText: false,
          lang: "ja",
        },
      ],
    };
    datasets.push(await verifyDataset(manifest, root));
  }
  const input: AutomationInput = {
    catalog: {
      version: 1,
      asOf,
      families: [
        {
          family,
          expectedIds: datasets.map((item) => item.manifest.id),
          enumerationEvidence: "https://www.shueisha.co.jp/",
          enumerationReviewed: true,
        },
      ],
    },
    datasets,
    asOf,
    editorialFrozen: false,
  };
  return { root, input, ledger: join(root, "automation.sqlite") };
}
function ports(calls: string[] = []): DragonBallAutomationPorts {
  return {
    ingest: async (source) => {
      calls.push("ingest");
      return done({
        sourceDigest: source.digest,
        indexed: true,
        vectorIndexed: true,
        documents: 1,
      });
    },
    verifyRag: async (source) => {
      calls.push("verifyRag");
      return done({
        sourceDigest: source.digest,
        indexed: true,
        vectorIndexed: true,
        documents: 1,
        verified: true,
        retrieval: "hybrid" as const,
        verifiedAt: Date.now(),
      });
    },
    prepareDataset: async (source) => {
      calls.push("prepareDataset");
      return done({
        sourceDigest: source.digest,
        datasetDigest: digest(`dataset:${source.digest}`),
        goldDigest: digest("gold"),
        approved: true,
        compatible: true,
        goldDisjoint: true,
      });
    },
    training: {
      capability: {
        nativeInProcess: true,
        handlerReady: true,
        authenticated: true,
        hardwareQualified: true,
        host: "omar-wsl",
      },
      train: async (dataset) => {
        calls.push("train");
        return done({
          datasetDigest: dataset.datasetDigest,
          modelDigest: digest("model"),
          host: "omar-wsl",
        });
      },
    },
    verifyHeldout: async (artifact, dataset) => {
      calls.push("verifyHeldout");
      return done({
        modelDigest: artifact.modelDigest,
        goldDigest: dataset.goldDigest,
        passed: true,
      });
    },
  };
}

test("native RAG lost acknowledgement retries stable documents after restart and caches verified steps", async () => {
  const { root, input, ledger } = await fixture();
  const writes = new Map<string, string>();
  let lost = true;
  const keys: string[] = [];
  const transport: NativeMcpTransport = async (request) => {
    expect(request.config).toBe(join(root, "protected-mcp.toml"));
    expect(request.server).toBe("aphrody");
    if (request.tool === "aphrody_shenron_rag_ingest") {
      writes.set(String(request.arguments.sourceId), String(request.arguments.content));
      if (lost) {
        lost = false;
        throw new Error("Lost ACK with PRIVATE TOKEN");
      }
      return envelope({
        sourceId: request.arguments.sourceId,
        indexed: true,
        vectorIndexed: true,
        retrieval: "hybrid",
      });
    }
    return envelope({ mode: "hybrid", results: [{ sourceId: request.arguments.sourceId }] });
  };
  const rag = createNativeRagPorts({ config: join(root, "protected-mcp.toml") }, transport);
  const ownerPorts = { ...ports(), ...rag, training: undefined };
  const ingest = ownerPorts.ingest;
  ownerPorts.ingest = async (source, context) => {
    keys.push(context.key);
    return ingest(source, context);
  };
  {
    using automation = new DragonBallAutomation(ledger, ownerPorts);
    const report = await automation.run(input);
    expect(report.checkpoints.find((item) => item.stage === "rag-ingest")?.state).toBe("blocked");
    expect(JSON.stringify(report)).not.toContain("PRIVATE TOKEN");
  }
  {
    using automation = new DragonBallAutomation(ledger, ownerPorts);
    const report = await automation.run(input);
    expect(writes.size).toBe(1);
    expect(keys[0]).toBe(keys[1]);
    expect(report.checkpoints.find((item) => item.stage === "rag-verify")?.state).toBe("completed");
    expect(report.checkpoints.find((item) => item.stage === "train")?.code).toBe(
      "native-training-host-unqualified",
    );
    await automation.run(input);
    expect(keys).toHaveLength(2);
    expect(JSON.stringify(automation.checkpoints())).not.toContain("PRIVATE SOURCE TEXT");
    expect(JSON.stringify(automation.checkpoints())).not.toContain("PRIVATE RIGHTS EVIDENCE");
  }
  expect((await stat(ledger)).mode & 0o777).toBe(0o600);
  expect((await stat(root)).mode & 0o777).toBe(0o700);
});

test("503, lexical ingest and absent post-ingest retrieval proof block dataset preparation", async () => {
  for (const failure of ["503", "lexical", "missing-hit"]) {
    const { root, input, ledger } = await fixture();
    const calls: string[] = [];
    const rag = createNativeRagPorts(
      { config: join(root, "protected-mcp.toml") },
      async (request) => {
        if (failure === "503")
          return envelope({ error: { code: "503", message: "RAG database unavailable" } });
        if (request.tool === "aphrody_shenron_rag_ingest")
          return envelope({
            sourceId: request.arguments.sourceId,
            indexed: true,
            vectorIndexed: failure !== "lexical",
            retrieval: failure === "lexical" ? "lexical" : "hybrid",
          });
        return envelope({ mode: "hybrid", results: [{ sourceId: "wrong-source" }] });
      },
    );
    using automation = new DragonBallAutomation(ledger, { ...ports(calls), ...rag });
    const report = await automation.run(input);
    expect(calls).toHaveLength(0);
    expect(
      report.checkpoints.some(
        (item) =>
          item.code ===
          {
            "503": "rag-backend-unavailable",
            lexical: "rag-vector-proof-missing",
            "missing-hit": "rag-retrieval-proof-missing",
          }[failure],
      ),
    ).toBe(true);
  }
});

test("current review and editorial freeze override historical successful proofs", async () => {
  const { input, ledger } = await fixture("databooks");
  const calls: string[] = [];
  using automation = new DragonBallAutomation(ledger, ports(calls));
  await automation.run(input);
  expect(calls).toEqual(["ingest", "verifyRag", "prepareDataset", "train", "verifyHeldout"]);
  calls.length = 0;
  const frozen = await automation.run({ ...input, editorialFrozen: true });
  expect(calls).toHaveLength(0);
  expect(frozen.complete).toBe(false);
  expect(frozen.checkpoints.some((item) => item.code === "editorial-freeze")).toBe(true);
  const revoked = structuredClone(input);
  revoked.datasets[0]!.manifest.items[0]!.review = "pending";
  const changed = await automation.run(revoked);
  expect(changed.checkpoints.some((item) => item.code === "rag-governance-unapproved")).toBe(true);
  expect(calls).toHaveLength(0);
});

test("unapproved training, overlapping gold and unsupported native host never call train", async () => {
  for (const blocker of ["review", "gold", "host", "subprocess", "handler"]) {
    const { input, ledger } = await fixture();
    const calls: string[] = [];
    const ownerPorts = ports(calls);
    if (blocker === "review") {
      input.datasets[0]!.manifest.trainingReview = "pending";
      input.datasets[0]!.digest = digest(JSON.stringify(input.datasets[0]!.manifest));
    } else if (blocker === "gold")
      ownerPorts.prepareDataset = async (source) =>
        done({
          sourceDigest: source.digest,
          datasetDigest: digest("same"),
          goldDigest: digest("same"),
          approved: true,
          compatible: true,
          goldDisjoint: false,
        });
    else if (blocker === "host") ownerPorts.training!.capability.host = "vps";
    else if (blocker === "subprocess") ownerPorts.training!.capability.nativeInProcess = false;
    else ownerPorts.training!.capability.handlerReady = false;
    using automation = new DragonBallAutomation(ledger, ownerPorts);
    const report = await automation.run(input);
    expect(calls).not.toContain("train");
    expect(report.checkpoints.some((item) => item.state === "blocked")).toBe(true);
  }
});

test("held-out failure is retried while training artifact remains cached", async () => {
  const { input, ledger } = await fixture();
  const calls: string[] = [];
  const ownerPorts = ports(calls);
  let passed = false;
  ownerPorts.verifyHeldout = async (artifact, dataset) => {
    calls.push("verifyHeldout");
    return done({ modelDigest: artifact.modelDigest, goldDigest: dataset.goldDigest, passed });
  };
  using automation = new DragonBallAutomation(ledger, ownerPorts);
  expect(
    (await automation.run(input)).checkpoints.some(
      (item) => item.code === "heldout-verification-failed",
    ),
  ).toBe(true);
  passed = true;
  await automation.run(input);
  expect(calls.filter((call) => call === "train")).toHaveLength(1);
  expect(calls.filter((call) => call === "verifyHeldout")).toHaveLength(2);
});

test("collection uses existing durable native placement through lost ACK and requires fresh inventory", async () => {
  const { root, input, ledger } = await fixture();
  input.datasets = [];
  input.collectionPlans = [
    {
      family: "guides",
      datasetId: "fixture_1",
      revision: digest("acquisition"),
      args: ["dragon-ball", "--source", "shueisha"],
      approved: true,
      rightsApproved: true,
      editorialTarget: "none",
    },
  ];
  const intents = new Map<string, { id: string; state: string }>();
  let lost = true;
  const routes: string[] = [];
  const transport: NativeMcpTransport = async (request) => {
    routes.push(request.config);
    if (request.tool === "aphrody_job_submit") {
      const key = String(request.arguments.idempotency_key);
      if (!intents.has(key)) intents.set(key, { id: "job-1", state: "succeeded" });
      if (lost) {
        lost = false;
        throw new Error("Lost submission ACK");
      }
      return envelope(intents.get(key));
    }
    if (request.arguments.id)
      return envelope({
        job: {
          id: "job-1",
          state: "succeeded",
          result: {
            profile: "dbfr",
            campaign: { schema: "aphrody-dragon-ball-crawl/v1", completed: true, errors: [] },
          },
        },
        queue: { queued: 0, running: 0 },
      });
    return envelope({ queue: { queued: 0, running: 0 } });
  };
  const hosts = [{ id: "vps", config: join(root, "vps-mcp.toml"), slots: 4, workerReady: true }];
  for (let pass = 0; pass < 2; pass++) {
    using jobs = new AphrodyWebJobs(join(root, "web-jobs.sqlite"), hosts, transport);
    using automation = new DragonBallAutomation(ledger, {
      collect: createNativeCollectionPort(jobs),
    });
    const result = await automation.run(input);
    expect(result.complete).toBe(false);
    expect(result.checkpoints.some((item) => item.stage === "rag-ingest")).toBe(false);
    if (pass === 1)
      expect(result.checkpoints.find((item) => item.stage === "collect")?.state).toBe("completed");
  }
  expect(intents.size).toBe(1);
  expect(routes.every((route) => route === hosts[0]!.config)).toBe(true);
});

test("collection approval is required and checkpoint intent is durable before the native call", async () => {
  const { input, ledger } = await fixture();
  input.datasets = [];
  const plan = {
    family: "guides" as const,
    datasetId: "fixture_1",
    revision: digest("collect"),
    args: ["crawl-index", "https://www.shueisha.co.jp/"],
    approved: false,
    rightsApproved: true,
    editorialTarget: "none" as const,
  };
  input.collectionPlans = [plan];
  let called = 0;
  let automation: DragonBallAutomation;
  automation = new DragonBallAutomation(ledger, {
    collect: async (_, context) => {
      called++;
      expect(automation.checkpoints().find((item) => item.key === context.key)?.state).toBe(
        "pending",
      );
      return done({ host: "vps", remoteId: "job-2" });
    },
  });
  try {
    expect(
      (await automation.run(input)).checkpoints.some(
        (item) => item.code === "collection-governance-unapproved",
      ),
    ).toBe(true);
    expect(called).toBe(0);
    plan.approved = true;
    await automation.run(input);
    expect(called).toBe(1);
  } finally {
    automation.close();
  }
});

test("parallelism is bounded, close waits for a pass and provider extensions never enter metadata", async () => {
  const { input, ledger } = await fixture("guides", 4);
  let active = 0;
  let peak = 0;
  const ownerPorts = ports();
  ownerPorts.ingest = async (source, context: AutomationContext) => {
    active++;
    peak = Math.max(peak, active);
    await Bun.sleep(10);
    active--;
    expect(context.key.length).toBeLessThanOrEqual(256);
    return done({
      sourceDigest: source.digest,
      indexed: true,
      vectorIndexed: true,
      documents: 1,
      secret: "PRIVATE PROVIDER EXTENSION",
    });
  };
  const automation = new DragonBallAutomation(ledger, ownerPorts, 2);
  const pass = automation.run(input);
  expect(() => automation.close()).toThrow("in flight");
  await expect(automation.run(input)).rejects.toThrow("already running");
  await pass;
  expect(peak).toBe(2);
  expect(JSON.stringify(automation.checkpoints())).not.toContain("PRIVATE PROVIDER EXTENSION");
  automation.close();
});

test("shared checkpoint directories are refused without changing their permissions", async () => {
  const { root, ledger } = await fixture();
  await chmod(root, 0o755);
  expect(() => new DragonBallAutomation(ledger, {})).toThrow("private directory");
  expect((await stat(root)).mode & 0o777).toBe(0o755);
  const source = await readFile(join(import.meta.dir, "../src/dragon-ball/automation.ts"), "utf8");
  expect(source).not.toMatch(/Bun\.spawn|spawnSync|commandPipeline|runProcess/);
  expect(new AutomationBlocked("rag-backend-unavailable").code).toBe("rag-backend-unavailable");
});

test("restart with a stale RAG proof rechecks the backend and never reuses it to train", async () => {
  const { root, input, ledger } = await fixture();
  let now = Date.now();
  let online = true;
  const calls: string[] = [];
  const ownerPorts = ports(calls);
  const rag = createNativeRagPorts(
    { config: join(root, "mcp.toml") },
    async (request) => {
      if (!online) return envelope({ error: { code: "503" } });
      if (request.tool === "aphrody_shenron_rag_ingest")
        return envelope({
          sourceId: request.arguments.sourceId,
          indexed: true,
          vectorIndexed: true,
          retrieval: "hybrid",
        });
      return envelope({ mode: "hybrid", results: [{ sourceId: request.arguments.sourceId }] });
    },
    () => now,
  );
  {
    using automation = new DragonBallAutomation(ledger, { ...ownerPorts, ...rag }, 2, () => now);
    await automation.run(input);
    expect(calls).toContain("train");
  }
  calls.length = 0;
  now += 3_600_001;
  online = false;
  {
    using automation = new DragonBallAutomation(ledger, { ...ownerPorts, ...rag }, 2, () => now);
    const report = await automation.run(input);
    expect(
      report.checkpoints.some(
        (item) => item.stage === "rag-verify" && item.code === "rag-backend-unavailable",
      ),
    ).toBe(true);
    expect(calls).toHaveLength(0);
    expect(report.checkpoints.some((item) => item.stage === "train")).toBe(false);
  }
});
