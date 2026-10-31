#!/usr/bin/env bun
/**
 * CLI unifié @aphrody/shenron-pipeline
 * Commande d'exécution unique pour tout l'offload : OCR, RAG, IA, Traduction, Crawl.
 * Le serveur MCP Shenron est porté par aphrody-ai (apps/shenron-mcp), plus par ce dépôt.
 * Usage :
 *   bun run pipeline <ocr|rag|ia|translation|crawl> [args...]
 */

import {
  buildRagIndex,
  evaluateRag,
  runCorpusIngest,
  runCrawl,
  runDatabooksOcr,
  runIaTask,
  runMangaOcr,
  runTranslation,
} from "./workflows";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  parseDatabookCandidateManifest,
  parseMangaCandidateManifest,
  toDatabookReviewCandidateInput,
  toMangaReviewCandidateInput,
  toNativeDatabookReviewCandidateInput,
  toNativeMangaReviewCandidateInput,
} from "./koharu";
import {
  toAphrodyDatabookReviewCandidateInput,
  toAphrodyMangaReviewCandidateInput,
  type OcrReviewImage,
} from "./aphrody-ocr-candidate";
import { KoharuSdkClient } from "./koharu-sdk-client";
import { submitCandidateFile } from "./candidate-submit";
import { parseArgs } from "node:util";
import type { CrawlTarget } from "./workflows";

const [command, ...args] = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith("--"));

async function main() {
  if (command === "dragon-ball") {
    if (args[0] === "export-crawl") {
      const { values } = parseArgs({
        args: args.slice(1),
        strict: true,
        options: {
          input: { type: "string" },
          output: { type: "string" },
          policy: { type: "string" },
          "job-id": { type: "string" },
          "job-status": { type: "string" },
        },
      });
      if (
        !values.input ||
        !values.output ||
        !values.policy ||
        !values["job-id"] ||
        !values["job-status"]
      )
        throw new Error(
          "export-crawl requires --input, --output, --policy, --job-id and --job-status",
        );
      const { exportNativeCrawlArtifact } = await import("./dragon-ball/crawl-ingest");
      const manifest = await exportNativeCrawlArtifact({
        inputPath: resolve(values.input),
        outputDir: resolve(values.output),
        policy: await Bun.file(values.policy).json(),
        jobId: values["job-id"],
        jobStatus: values["job-status"],
      });
      console.log(JSON.stringify(manifest, null, 2));
    } else if (args[0] === "coverage") {
      const { values } = parseArgs({
        args: args.slice(1),
        strict: true,
        options: {
          catalogue: { type: "string" },
          manifests: { type: "string" },
          assets: { type: "string" },
          "repo-root": { type: "string" },
          "freeze-file": { type: "string" },
          "as-of": { type: "string" },
        },
      });
      if (!values.catalogue || !values.manifests || !values.assets)
        throw new Error("coverage requires --catalogue, --manifests and --assets");
      const { loadDatasetInventory } = await import("./dragon-ball/dataset-inventory");
      const { coverage, unavailable } = await loadDatasetInventory({
        catalogPath: values.catalogue,
        manifestRoot: values.manifests,
        assetRoot: values.assets,
        repoRoot: values["repo-root"] ?? resolve(import.meta.dir, "../../.."),
        freezeFile: values["freeze-file"],
        asOf: values["as-of"],
      });
      console.log(JSON.stringify({ ...coverage, unavailable }, null, 2));
      if (!coverage.coverageComplete) process.exitCode = 2;
    } else if (args[0] === "audit-crawl-media") {
      const { values } = parseArgs({
        args: args.slice(1),
        strict: true,
        options: {
          input: { type: "string" },
          policy: { type: "string" },
          "max-files": { type: "string", default: "250" },
          concurrency: { type: "string", default: "2" },
        },
      });
      if (!values.input || !values.policy)
        throw new Error("audit-crawl-media requires --input and --policy");
      const { auditNativeCrawlMedia } = await import("./dragon-ball/crawl-ingest");
      const report = await auditNativeCrawlMedia({
        inputPath: resolve(values.input),
        policy: await Bun.file(values.policy).json(),
        maxFiles: Number(values["max-files"]),
        concurrency: Number(values.concurrency),
      });
      console.log(JSON.stringify(report, null, 2));
      if (!report.completeInventory || report.repairCandidates.length || report.unavailable.length)
        process.exitCode = 2;
    } else if (args[0] === "ingest-crawl") {
      const { values } = parseArgs({
        args: args.slice(1),
        strict: true,
        options: {
          input: { type: "string" },
          manifest: { type: "string" },
          policy: { type: "string" },
          "max-documents": { type: "string", default: "10000" },
          apply: { type: "boolean", default: false },
        },
      });
      if (!values.input || !values.policy || (values.apply && !values.manifest))
        throw new Error("ingest-crawl requires --input, --policy and --manifest for --apply");
      const { ingestNativeCrawl, createPostgresCrawlRegistry, verifyNativeCrawlArtifact } =
        await import("./dragon-ball/crawl-ingest");
      const policy = await Bun.file(values.policy).json();
      const options = {
        inputPath: resolve(values.input),
        manifestPath: values.manifest ? resolve(values.manifest) : undefined,
        policy,
        apply: values.apply,
        maxDocuments: Number(values["max-documents"]),
      };
      if (options.manifestPath)
        await verifyNativeCrawlArtifact({
          inputPath: options.inputPath,
          manifestPath: options.manifestPath,
          policy,
          maxDocuments: options.maxDocuments,
        });
      if (!values.apply) {
        const report = await ingestNativeCrawl(options);
        console.log(JSON.stringify(report, null, 2));
        if (!report.complete) process.exitCode = 2;
      } else {
        if (!process.env.DATABASE_URL) throw new Error("The DBFR DATABASE_URL is required");
        const { default: postgres } = await import("postgres");
        const sql = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });
        try {
          const report = await ingestNativeCrawl(options, createPostgresCrawlRegistry(sql));
          console.log(JSON.stringify(report, null, 2));
          if (!report.complete) process.exitCode = 2;
        } finally {
          await sql.end({ timeout: 5 });
        }
      }
    } else if (args[0] === "automate") {
      const { values } = parseArgs({
        args: args.slice(1),
        strict: true,
        options: {
          catalogue: { type: "string" },
          manifests: { type: "string" },
          assets: { type: "string" },
          ledger: { type: "string" },
          "mcp-config": { type: "string" },
          hosts: { type: "string" },
          "jobs-ledger": { type: "string" },
          "collection-plans": { type: "string" },
          "training-datasets": { type: "string" },
          "training-root": { type: "string" },
          "repo-root": { type: "string" },
          "freeze-file": { type: "string" },
          concurrency: { type: "string", default: "2" },
          interval: { type: "string", default: "60" },
          watch: { type: "boolean", default: false },
        },
      });
      if (
        !values.catalogue ||
        !values.manifests ||
        !values.assets ||
        !values.ledger ||
        !values["mcp-config"]
      )
        throw new Error(
          "automate requires --catalogue, --manifests, --assets, --ledger and --mcp-config",
        );
      if (Boolean(values.hosts) !== Boolean(values["jobs-ledger"]))
        throw new Error("--hosts and --jobs-ledger must be provided together");
      if (Boolean(values["training-datasets"]) !== Boolean(values["training-root"]))
        throw new Error("--training-datasets and --training-root must be provided together");
      const interval = Number(values.interval);
      if (!Number.isInteger(interval) || interval < 5 || interval > 3600)
        throw new Error("Automation interval must be 5..3600 seconds");
      const { z } = await import("zod");
      const { datasetCatalogSchema, datasetManifestSchema } =
        await import("./dragon-ball/source-coverage");
      const { loadDatasetInventory, resolveDatasetEditorialFreeze } =
        await import("./dragon-ball/dataset-inventory");
      const { DragonBallAutomation, createNativeRagPorts, createNativeCollectionPort } =
        await import("./dragon-ball/automation");
      const { AphrodyWebJobs } = await import("./aphrody/jobs");
      const { createApprovedTrainingDatasetPort } = await import("./dragon-ball/training-dataset");
      const hostSchema = z.array(
        z
          .object({
            id: z.string(),
            config: z.string(),
            server: z.literal("aphrody").optional(),
            slots: z.number().int(),
            workerReady: z.boolean(),
          })
          .strict(),
      );
      const plansSchema = z.array(
        z
          .object({
            family: datasetManifestSchema.shape.family,
            datasetId: datasetManifestSchema.shape.id,
            revision: z.string().regex(/^[a-f0-9]{64}$/),
            args: z.array(z.string()).min(1).max(256),
            approved: z.boolean(),
            rightsApproved: z.boolean(),
            editorialTarget: datasetManifestSchema.shape.editorialTarget,
          })
          .strict(),
      );
      const jobs = values.hosts
        ? new AphrodyWebJobs(
            values["jobs-ledger"]!,
            hostSchema.parse(await Bun.file(values.hosts).json()),
          )
        : undefined;
      const controller = new AbortController();
      const stop = () => controller.abort(new Error("Automation stopped"));
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      try {
        using automation = new DragonBallAutomation(
          values.ledger,
          {
            ...createNativeRagPorts({ config: values["mcp-config"] }),
            ...(jobs ? { collect: createNativeCollectionPort(jobs) } : {}),
            ...(values["training-datasets"]
              ? {
                  prepareDataset: createApprovedTrainingDatasetPort({
                    manifestPath: values["training-datasets"],
                    root: values["training-root"]!,
                  }),
                }
              : {}),
          },
          Number(values.concurrency),
        );
        const options = {
          catalogPath: values.catalogue,
          manifestRoot: values.manifests,
          assetRoot: values.assets,
          repoRoot: values["repo-root"] ?? resolve(import.meta.dir, "../../.."),
          freezeFile: values["freeze-file"],
        };
        do {
          const inventory = await loadDatasetInventory(options);
          if (inventory.unavailable.some((item) => item.family === null)) {
            console.log(
              JSON.stringify(
                { ...inventory.coverage, unavailable: inventory.unavailable },
                null,
                2,
              ),
            );
            if (!values.watch) process.exitCode = 2;
          } else {
            const report = await automation.run({
              catalog: datasetCatalogSchema.parse(await Bun.file(values.catalogue).json()),
              datasets: inventory.verifiedDatasets,
              collectionPlans: values["collection-plans"]
                ? plansSchema.parse(await Bun.file(values["collection-plans"]).json())
                : [],
              editorialFrozen: (await resolveDatasetEditorialFreeze(options)).frozen,
              signal: controller.signal,
            });
            console.log(JSON.stringify({ ...report, unavailable: inventory.unavailable }, null, 2));
            if (!values.watch && !report.complete) process.exitCode = 2;
          }
          if (!values.watch) break;
          for (let elapsed = 0; elapsed < interval && !controller.signal.aborted; elapsed++)
            await Bun.sleep(1000);
        } while (!controller.signal.aborted);
      } finally {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        jobs?.close();
      }
    } else if (args[0] === "catalogue-enrich") {
      const { values } = parseArgs({
        args: args.slice(1),
        strict: true,
        options: {
          catalogue: { type: "string" },
          output: { type: "string" },
          "assets-index": { type: "string" },
          sqlite: { type: "string" },
          "freeze-file": { type: "string" },
          apply: { type: "boolean", default: false },
        },
      });
      if (!values.catalogue) throw new Error("catalogue-enrich requires --catalogue");
      const { enrichDragonBallCatalogue } = await import("./dragon-ball/enrichment");
      console.log(
        JSON.stringify(
          await enrichDragonBallCatalogue({
            cataloguePath: values.catalogue,
            outputPath: values.output,
            assetsIndexPath: values["assets-index"],
            sqlitePath: values.sqlite,
            freezeFile: values["freeze-file"],
            apply: values.apply,
          }),
          null,
          2,
        ),
      );
    } else {
      const { runAphrodyCommand } = await import("./aphrody/native-commands");
      const result = await runAphrodyCommand(["web", "dragon-ball", ...args], {
        timeoutMs: 1_800_000,
        json: true,
      });
      if (result.kind !== "exit" || !result.ok)
        throw new Error(`Native Dragon Ball command failed: ${JSON.stringify(result)}`);
      console.log(JSON.stringify(result.data, null, 2));
    }
    return;
  }
  if (command === "auto") {
    const { values } = parseArgs({
      args,
      strict: true,
      options: {
        seed: { type: "string", multiple: true },
        allow: { type: "string", multiple: true },
        out: { type: "string" },
        "max-pages": { type: "string", default: "50" },
        "skip-eval": { type: "boolean", default: false },
      },
    });
    if (!values.seed?.length || !values.allow?.length)
      throw new Error("auto requires --seed and --allow (allowlisted hosts)");
    const root = resolve(import.meta.dir, "../../..");
    const { runAuto } = await import("./auto");
    const { runnersFromEnv } = await import("./auto/workers");
    const { configuredProvider } = await import("./ai/jev-provider");
    const report = await runAuto({
      seeds: values.seed,
      allowHosts: values.allow,
      out: values.out ?? resolve(root, "var/reports/auto"),
      maxPages: Number(values["max-pages"]),
      runners: runnersFromEnv(process.env),
      provider: await configuredProvider(process.env),
      log: (line) => console.error(line),
    });
    console.log(JSON.stringify(report, null, 2));
    if (!values["skip-eval"]) {
      const orchestrator = await import("./orchestrator");
      const { DEFAULT_STAGES } = await import("./orchestrator-stages");
      const only = ["rag", "canon", "decision-probe"];
      const state = await orchestrator.runPipeline(DEFAULT_STAGES, {
        cwd: root,
        stateFile: orchestrator.defaultStateFile(root),
        historyFile: orchestrator.defaultHistoryFile(root),
        only,
        log: (line) => console.error(line),
      });
      process.exitCode = orchestrator.pipelineExitCode(
        state,
        orchestrator.selectStages(DEFAULT_STAGES, only),
      );
    }
    return;
  }
  if (command === "run" || command === "plan" || command === "status") {
    const { values } = parseArgs({
      args,
      strict: true,
      options: {
        only: { type: "string", multiple: true },
        resume: { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
        concurrency: { type: "string", default: "4" },
        json: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
      },
    });
    const { DEFAULT_STAGES } = await import("./orchestrator-stages");
    const orchestrator = await import("./orchestrator");
    const root = resolve(import.meta.dir, "../../..");
    const stateFile = orchestrator.defaultStateFile(root);
    if (command === "status") {
      const state = await orchestrator.readState(stateFile);
      const { recentRuns } = await import("./orchestrator-store");
      const history = (await Bun.file(orchestrator.defaultHistoryFile(root)).exists())
        ? recentRuns(orchestrator.defaultHistoryFile(root))
        : [];
      console.log(
        state ? JSON.stringify({ ...state, history }, null, 2) : "no pipeline run recorded",
      );
      return;
    }
    const only = values.only?.flatMap((id) => id.split(","));
    const selected = orchestrator.selectStages(DEFAULT_STAGES, only);
    const state = await orchestrator.runPipeline(DEFAULT_STAGES, {
      cwd: root,
      stateFile,
      historyFile: orchestrator.defaultHistoryFile(root),
      force: values.force,
      only,
      resume: values.resume,
      dryRun: command === "plan" || values["dry-run"],
      concurrency: Number(values.concurrency),
      log: (line) => console.error(line),
    });
    if (values.json) console.log(JSON.stringify(state, null, 2));
    process.exitCode = orchestrator.pipelineExitCode(state, selected);
    return;
  }
  if (command === "unify") {
    const { values } = parseArgs({
      args,
      strict: true,
      options: {
        "dry-run": { type: "boolean", default: false },
        out: { type: "string" },
      },
    });
    if (values.out !== undefined && !values.out.trim())
      throw new Error("The corpus output directory must not be empty");
    console.log(
      JSON.stringify(
        await runCorpusIngest({ dryRun: values["dry-run"], outDir: values.out }),
        null,
        2,
      ),
    );
    return;
  }
  if (command === "crawl") {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        "dry-run": { type: "boolean", default: false },
        "max-depth": { type: "string" },
        "max-requests": { type: "string" },
        out: { type: "string" },
      },
    });
    if (positionals.length > 2) throw new Error("usage: pipeline crawl <source> [URL] [options]");
    const result = await runCrawl({
      source: (positionals[0] ?? "universal") as CrawlTarget["source"],
      url: positionals[1],
      dryRun: values["dry-run"],
      depth: values["max-depth"] === undefined ? undefined : Number(values["max-depth"]),
      maxRequests:
        values["max-requests"] === undefined ? undefined : Number(values["max-requests"]),
      outDir: values.out,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "aphrody-ocr-candidate") {
    const [kind, manifestPath, inputPath, outputPath] = args;
    if (
      (kind !== "manga" && kind !== "databook") ||
      !manifestPath ||
      !inputPath ||
      !outputPath ||
      args.length !== 4
    ) {
      throw new Error(
        "usage: pipeline aphrody-ocr-candidate <manga|databook> <hash-bearing-manifest.json> <aphrody-ocr-v2.jsonl> <unreviewed-candidates.jsonl>",
      );
    }
    if (await Bun.file(outputPath).exists())
      throw new Error(`refusing to overwrite candidate artifact: ${outputPath}`);
    const manifest =
      kind === "manga"
        ? parseMangaCandidateManifest(await Bun.file(manifestPath).json())
        : parseDatabookCandidateManifest(await Bun.file(manifestPath).json());
    const byImageHash = new Map<string, (typeof manifest)[number]>();
    for (const entry of manifest) {
      if (byImageHash.has(entry.imageSha256))
        throw new Error(`ambiguous manifest image digest: ${entry.imageSha256}`);
      byImageHash.set(entry.imageSha256, entry);
    }
    const input = Bun.file(inputPath);
    if (input.size > 150_000_000) throw new Error("OCR result artifact exceeds 150 MB");
    const lines = (await input.text()).split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) throw new Error("OCR result artifact is empty");
    const output: string[] = [];
    const seen = new Set<string>();
    const manifestDirectory = dirname(resolve(manifestPath));
    for (const [index, line] of lines.entries()) {
      let result: unknown;
      try {
        result = JSON.parse(line);
      } catch {
        throw new Error(`invalid OCR JSON at line ${index + 1}`);
      }
      const digest = (result as { image?: { sha256?: unknown } } | null)?.image?.sha256;
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) {
        throw new Error(`OCR line ${index + 1} has no trustworthy image SHA-256`);
      }
      const entry = byImageHash.get(digest);
      if (!entry) throw new Error(`OCR line ${index + 1} has no matching Shenron manifest image`);
      if (seen.has(digest))
        throw new Error(`duplicate OCR result for Shenron image: ${entry.image}`);
      seen.add(digest);
      const imagePath = resolve(manifestDirectory, entry.image);
      const imageRelative = relative(manifestDirectory, imagePath);
      if (isAbsolute(entry.image) || imageRelative.startsWith("..") || isAbsolute(imageRelative)) {
        throw new Error(`manifest image leaves its export directory: ${entry.image}`);
      }
      const imageBytes = await Bun.file(imagePath).arrayBuffer();
      if (new Bun.CryptoHasher("sha256").update(imageBytes).digest("hex") !== digest) {
        throw new Error(`manifest review image changed: ${entry.image}`);
      }
      const { default: sharp } = await import("sharp");
      const metadata = await sharp(imageBytes).metadata();
      if (!metadata.width || !metadata.height)
        throw new Error(`manifest image has no dimensions: ${entry.image}`);
      const mime: OcrReviewImage["mime"] | null =
        metadata.format === "jpeg"
          ? "image/jpeg"
          : metadata.format === "png"
            ? "image/png"
            : metadata.format === "webp"
              ? "image/webp"
              : null;
      if (!mime) throw new Error(`unsupported manifest image format: ${entry.image}`);
      const image = { mime, width: metadata.width, height: metadata.height };
      const candidate =
        kind === "manga"
          ? toAphrodyMangaReviewCandidateInput(
              result,
              entry as ReturnType<typeof parseMangaCandidateManifest>[number],
              image,
            )
          : toAphrodyDatabookReviewCandidateInput(
              result,
              entry as ReturnType<typeof parseDatabookCandidateManifest>[number],
              image,
            );
      output.push(JSON.stringify(candidate));
    }
    await Bun.write(outputPath, `${output.join("\n")}\n`);
    console.log(
      JSON.stringify({
        status: "ocr_candidate_artifact_written",
        kind,
        count: output.length,
        output: outputPath,
      }),
    );
    return;
  }
  if (command === "koharu-submit") {
    const fileFlag = args.indexOf("--file");
    const file = fileFlag === -1 ? undefined : args[fileFlag + 1];
    if (!file || args.length !== 2)
      throw new Error(
        "usage: pipeline koharu-submit --file <unreviewed-candidates.jsonl> (env SHENRON_API_URL, SHENRON_API_TOKEN)",
      );
    const { count, response } = await submitCandidateFile(file);
    console.log(JSON.stringify({ status: "candidates_submitted", count, response }));
    return;
  }
  if (command === "koharu-native-candidate") {
    const [kind, manifestPath, projectRoot, projectName, outputPath] = args;
    const sdkFlag = args.indexOf("--sdk");
    if (
      (kind !== "manga" && kind !== "databook") ||
      !manifestPath ||
      !projectRoot ||
      !projectName ||
      !outputPath ||
      (sdkFlag !== -1 && (!args[sdkFlag + 1] || sdkFlag !== 5)) ||
      (sdkFlag === -1 && args.length !== 5) ||
      args.length > 7
    ) {
      throw new Error(
        "usage: pipeline koharu-native-candidate <manga|databook> <manifest.json> <project-root> <project-name> <unreviewed-candidates.jsonl> [--sdk <koharu-sdk-binary>]",
      );
    }
    if (await Bun.file(outputPath).exists())
      throw new Error(`refusing to overwrite candidate artifact: ${outputPath}`);
    const manifest =
      kind === "manga"
        ? parseMangaCandidateManifest(await Bun.file(manifestPath).json())
        : parseDatabookCandidateManifest(await Bun.file(manifestPath).json());
    const byImageHash = new Map<string, (typeof manifest)[number]>();
    for (const entry of manifest) {
      if (byImageHash.has(entry.imageSha256))
        throw new Error(`ambiguous manifest image digest: ${entry.imageSha256}`);
      byImageHash.set(entry.imageSha256, entry);
    }
    const sdk = new KoharuSdkClient(
      projectRoot,
      sdkFlag === -1 ? "koharu-sdk" : args[sdkFlag + 1]!,
    );
    const call = (method: string, params: unknown) => sdk.call(method, params);
    const output: string[] = [];
    const seen = new Set<string>();
    try {
      await call("project.open", { name: projectName });
      const pages = await call("project.pages", {});
      if (!Array.isArray(pages)) throw new Error("Koharu SDK project.pages returned no page list");
      for (const rawPage of pages) {
        const page = rawPage as { id?: unknown };
        if (typeof page?.id !== "string")
          throw new Error("Koharu SDK project.pages returned a page without ID");
        const nativeDigest = (await call("page.sourceSha256", { page: page.id })) as {
          sha256?: unknown;
        };
        if (
          typeof nativeDigest?.sha256 !== "string" ||
          !/^[a-f0-9]{64}$/.test(nativeDigest.sha256)
        ) {
          throw new Error(`Koharu SDK returned an invalid source digest for page ${page.id}`);
        }
        const entry = byImageHash.get(nativeDigest.sha256);
        if (!entry) continue;
        if (seen.has(entry.imageSha256))
          throw new Error(`multiple Koharu pages match one Shenron manifest image: ${entry.image}`);
        seen.add(entry.imageSha256);
        const manifestDirectory = dirname(resolve(manifestPath));
        const imagePath = resolve(manifestDirectory, entry.image);
        const imageRelative = relative(manifestDirectory, imagePath);
        if (
          isAbsolute(entry.image) ||
          imageRelative.startsWith("..") ||
          isAbsolute(imageRelative)
        ) {
          throw new Error(`manifest image leaves its export directory: ${entry.image}`);
        }
        const imageBytes = await Bun.file(imagePath).arrayBuffer();
        if (new Bun.CryptoHasher("sha256").update(imageBytes).digest("hex") !== entry.imageSha256) {
          throw new Error(`manifest review image changed: ${entry.image}`);
        }
        const { default: sharp } = await import("sharp");
        const metadata = await sharp(imageBytes).metadata();
        if (!metadata.width || !metadata.height)
          throw new Error(`manifest image has no dimensions: ${entry.image}`);
        const mime =
          metadata.format === "jpeg"
            ? "image/jpeg"
            : metadata.format === "png"
              ? "image/png"
              : metadata.format === "webp"
                ? "image/webp"
                : null;
        if (!mime) throw new Error(`unsupported manifest image format: ${entry.image}`);
        const result = await call("page.result", { page: page.id });
        if ((result as { page?: unknown } | null)?.page !== page.id)
          throw new Error("Koharu SDK page.result returned the wrong page");
        const evidence = { result, sourceSha256: nativeDigest.sha256 };
        const candidate =
          kind === "manga"
            ? toNativeMangaReviewCandidateInput(
                evidence,
                entry as ReturnType<typeof parseMangaCandidateManifest>[number],
                mime,
                metadata.width,
                metadata.height,
              )
            : toNativeDatabookReviewCandidateInput(
                evidence,
                entry as ReturnType<typeof parseDatabookCandidateManifest>[number],
                mime,
                metadata.width,
                metadata.height,
              );
        output.push(JSON.stringify(candidate));
      }
      if (!output.length)
        throw new Error("no Koharu project page matches a Shenron manifest image digest");
      await Bun.write(outputPath, `${output.join("\n")}\n`);
      console.log(
        JSON.stringify({
          status: "native_candidate_artifact_written",
          kind,
          count: output.length,
          output: outputPath,
        }),
      );
    } finally {
      await sdk.close();
    }
    return;
  }
  if (command === "koharu-candidate") {
    const [manifestPath, inputPath, outputPath] = positional;
    if (!manifestPath || !inputPath || !outputPath) {
      throw new Error(
        "usage: pipeline koharu-candidate <manga-manifest.json> <koharu-page-results.jsonl> <unreviewed-candidates.jsonl>",
      );
    }
    if (await Bun.file(outputPath).exists())
      throw new Error(`refusing to overwrite candidate artifact: ${outputPath}`);
    const manifest = parseMangaCandidateManifest(await Bun.file(manifestPath).json());
    const byId = new Map(manifest.map((entry) => [entry.id, entry]));
    const seen = new Set<string>();
    const lines = (await Bun.file(inputPath).text()).split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) throw new Error("Koharu candidate JSONL is empty");
    const output = lines.map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`invalid candidate JSON at line ${index + 1}`);
      }
      const pageId = (value as { source?: { pageId?: unknown } } | null)?.source?.pageId;
      if (typeof pageId !== "string") throw new Error(`candidate line ${index + 1} has no pageId`);
      const entry = byId.get(pageId);
      if (!entry) throw new Error(`candidate page is absent from the Shenron manifest: ${pageId}`);
      if (seen.has(pageId)) throw new Error(`duplicate candidate page: ${pageId}`);
      seen.add(pageId);
      return JSON.stringify(toMangaReviewCandidateInput(value, entry));
    });
    await Bun.write(outputPath, `${output.join("\n")}\n`);
    console.log(
      JSON.stringify({
        status: "candidate_artifact_written",
        count: output.length,
        output: outputPath,
      }),
    );
    return;
  }
  if (command === "koharu-databook-candidate") {
    const [manifestPath, inputPath, outputPath] = positional;
    if (!manifestPath || !inputPath || !outputPath) {
      throw new Error(
        "usage: pipeline koharu-databook-candidate <hash-bearing-manifest.json> <koharu-page-results.jsonl> <unreviewed-candidates.jsonl>",
      );
    }
    if (await Bun.file(outputPath).exists())
      throw new Error(`refusing to overwrite candidate artifact: ${outputPath}`);
    const manifest = parseDatabookCandidateManifest(await Bun.file(manifestPath).json());
    const byKey = new Map(manifest.map((entry) => [`${entry.databookId}:${entry.page}`, entry]));
    const seen = new Set<string>();
    const lines = (await Bun.file(inputPath).text()).split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) throw new Error("Koharu candidate JSONL is empty");
    const output = lines.map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`invalid candidate JSON at line ${index + 1}`);
      }
      const source = (
        value as { source?: { kind?: unknown; entityId?: unknown; plateNumber?: unknown } } | null
      )?.source;
      if (
        source?.kind !== "databook" ||
        !Number.isSafeInteger(source.entityId) ||
        !Number.isSafeInteger(source.plateNumber)
      ) {
        throw new Error(
          `candidate line ${index + 1} needs databook kind, entityId, and plateNumber`,
        );
      }
      const key = `${source.entityId}:${source.plateNumber}`;
      const entry = byKey.get(key);
      if (!entry)
        throw new Error(`candidate page is absent from the Shenron databook manifest: ${key}`);
      if (seen.has(key)) throw new Error(`duplicate databook candidate page: ${key}`);
      seen.add(key);
      return JSON.stringify(toDatabookReviewCandidateInput(value, entry));
    });
    await Bun.write(outputPath, `${output.join("\n")}\n`);
    console.log(
      JSON.stringify({
        status: "databook_candidate_artifact_written",
        count: output.length,
        output: outputPath,
      }),
    );
    return;
  }
  const dryRun = args.includes("--dry-run");
  let result: unknown;
  switch (command) {
    case "ocr":
      console.log("=== Pipeline OCR ===");
      if (positional[0] === "databooks") {
        result = await runDatabooksOcr({ dryRun });
      } else {
        result = await runMangaOcr({ dryRun });
      }
      break;
    case "rag":
      console.log("=== Pipeline RAG ===");
      if (positional[0] === "eval") {
        result = await evaluateRag({ dryRun });
      } else {
        result = await buildRagIndex({ dryRun });
      }
      break;
    case "ia":
      console.log("=== Pipeline IA ===");
      result = dryRun
        ? { status: "planned", endpoint: "/api/v1/shenron/llm/chat" }
        : await runIaTask({ task: positional.join(" ") || "default" });
      break;
    case "translation":
    case "translate":
      console.log("=== Pipeline Traduction ===");
      result = await runTranslation({ dryRun, args });
      break;
    default:
      console.log(`
Usage: bun run pipeline <module> [options]

Modules unifiés (exécutables hors du VPS principal) :
	aphrody-ocr-candidate Lie le JSONL OCR v2 Aphrody aux images/manifeste Shenron sans décision éditoriale
  koharu-candidate Lie des résultats Aphrody Koharu au manifeste et écrit des candidats non arbitrés
  koharu-databook-candidate Lie les résultats Koharu databooks au manifeste haché et écrit des candidats non arbitrés
  koharu-native-candidate Lit un projet du SDK Rust et lie les images exactes au manifeste Shenron
  ocr          Exécute les tâches OCR Manga et Databooks
  rag          Construit ou évalue l'index vectoriel RAG
  ia           Orchestration des workflows et agents IA
  translation  Lance la supervision Bun des traductions databooks et du RAG
  crawl        Exécute le module Dragon Ball natif d'Aphrody Web (guides, databooks, official, kanzenshuu, dragonballcn, universal, custom)
  dragon-ball  Module natif FFI ; coverage vérifie les datasets, ingest-crawl classe les exports natifs, automate reprend les étapes
  unify        Ingère les exports Aphrody Web dans le store Aphrody RAG
  run          Pipeline unifiée dataset > canon/rag > decision > wiki/agent-home > plugin (--only, --resume, --dry-run, --force)
  plan         Affiche l'ordre d'exécution sans rien lancer
  status       Dernier état enregistré (var/reports/pipeline/last-run.json)
`);
      process.exit(command ? 1 : 0);
  }
  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[Pipeline] Erreur:", err);
  process.exit(1);
});
