// SPDX-License-Identifier: Apache-2.0
/** Unified operational workflows: OCR, RAG, agent orchestration, crawling and translation. */
import { homedir } from "node:os";
import { join } from "node:path";
import { wrapLanguageModel } from "ai";
import { AphrodyComputeClient } from "@aphrody/shenron-pipeline/aphrody";
import { aphrodyComputeFromChat } from "@aphrody/shenron-pipeline/aphrody/compute";
import { createAphrodyChatModel } from "@aphrody/shenron-pipeline/ai/chat";
import { SHENRON_E5 } from "@aphrody/shenron-pipeline/ai/config";
import {
  generateGroundedAnswer,
  type GroundedAnswerInput,
  type GroundedHit,
} from "@aphrody/shenron-pipeline/ai/generate";
import { withHomePersona, type HomePersona } from "@aphrody/shenron-pipeline/ai/prompts";
import { loadShenronHomePersona, type AgentEnv } from "./agent-home";
import { executeCommand, type CommandRunner, type PipelineExecution } from "./execution";
import { crawlJobOutputDirectory, type WebJobIntent } from "./aphrody/jobs";

export { getToriyamaPersona } from "./agent-home";

/**
 * Pipeline IA — Agent Shenron / Akira Toriyama (Bird Studio x DBFR)
 * Moteur souverain d'orchestration cognitive déporté hors du VPS.
 * Raccordé à : RAG hybride, Vision/OCR, PostgreSQL (shenron_site) & SQLite, Crawl, et Persona Toriyama.
 */

export interface IaTaskOptions {
  task: string;
  prompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  withRag?: boolean;
  withVision?: boolean;
  withPostgres?: boolean;
  chat?: (prompt: string, model?: string) => Promise<{ answer: string; model: string }>;
  /** Modèle AI SDK injecté (tests, autre transport) ; prioritaire sur `chat`. */
  languageModel?: GroundedAnswerInput["model"];
  /** Environnement qui désigne l'Agent Home (défaut `process.env`) ; voir `./agent-home`. */
  env?: AgentEnv;
}
export interface ShenronAgentResponse {
  role: "assistant";
  content: string;
  thought?: string;
  modelUsed: string;
  citations?: Array<{ title: string; snippet: string; score: number }>;
  ocrContext?: string;
  dbState?: { postgresConnected: boolean; sqliteCached: boolean };
}

/**
 * Ajoute le ton et le style du profil Agent Home aux instructions du système. Le garde
 * anti-injection reste la dernière phrase (`withHomePersona`).
 */
function withHomeInstructions(
  model: GroundedAnswerInput["model"],
  persona: HomePersona,
): GroundedAnswerInput["model"] {
  return wrapLanguageModel({
    model,
    middleware: {
      transformParams: async ({ params }) => ({
        ...params,
        prompt: params.prompt.map((message) =>
          message.role === "system"
            ? { ...message, content: withHomePersona(message.content, persona) }
            : message,
        ),
      }),
    },
  });
}

/**
 * Tâche IA ancrée (B5) : les citations récupérées par le RAG sont réellement
 * injectées dans le prompt via `generateGroundedAnswer` (persona Shenron,
 * règles et garde anti-injection de `@aphrody/shenron-pipeline/ai/prompts`). Le ton et le
 * style du profil Agent Home du domaine (`./agent-home`) s'y ajoutent quand le
 * profil existe ; sinon la persona canonique seule. Aucun repli silencieux :
 * une configuration d'Agent Home invalide, une génération en échec rejettent avec
 * l'erreur d'origine, une réponse vide avec « Agent Aphrody terminé sans réponse ».
 */
export async function runIaTask(options: IaTaskOptions): Promise<ShenronAgentResponse> {
  const prompt = options.prompt ?? options.task;
  const home = loadShenronHomePersona(options.env);

  // 1. Enrichissement RAG si pertinent
  const citations: Array<{ title: string; snippet: string; score: number }> = [];
  const groundedHits: GroundedHit[] = [];
  if (options.withRag !== false) {
    const hits = await searchRagIndex(prompt, 3);
    for (const [index, h] of hits.entries()) {
      citations.push({ title: h.title, snippet: h.snippet, score: h.score });
      groundedHits.push({
        id: `citation-${index + 1}`,
        title: h.title,
        url: h.url ?? "",
        content: h.snippet,
      });
    }
  }

  // 2. Modèle : injecté, sinon fonction `chat` héritée, sinon la façade Aphrody.
  let modelUsed = "";
  const record = (value: { answer: string; model: string }) => {
    modelUsed = value.model;
    return value;
  };
  const model =
    options.languageModel ??
    createAphrodyChatModel(
      aphrodyComputeFromChat(async (messages, selectedModel) => {
        if (options.chat) {
          // Contrat historique : une seule chaîne de prompt.
          return record(
            await options.chat(messages.map((m) => m.content).join("\n\n"), selectedModel),
          );
        }
        return record(await new AphrodyComputeClient().chat(messages, selectedModel));
      }),
      // Chaîne vide = aucun `model` envoyé : Aphrody garde son modèle par défaut, comme avant.
      { modelId: options.model ?? "" },
    );

  let failure: unknown;
  const result = await generateGroundedAnswer({
    model: home ? withHomeInstructions(model, home) : model,
    persona: "shenron",
    question: prompt,
    hits: groundedHits,
    chunks: { contentFor: async () => new Map() },
    onError: (stage, error) => {
      if (stage === "generate") failure = error;
    },
  });
  if (failure !== undefined) throw failure;
  const assistantReply = result.fallback ? "" : result.answer.trim();
  if (!assistantReply) throw new Error("Agent Aphrody terminé sans réponse");

  return {
    role: "assistant",
    content: assistantReply,
    modelUsed: modelUsed || model.modelId,
    citations,
  };
}

export interface OcrJobOptions {
  lotId?: string;
  tome?: number;
  sourceDir?: string;
  concurrency?: number;
  dryRun?: boolean;
  runner?: CommandRunner;
}

export async function runMangaOcr(options: OcrJobOptions = {}): Promise<PipelineExecution> {
  const root = join(import.meta.dir, "../../..");
  if (options.tome !== undefined) throw new Error("Le filtre tome exige lotId");
  const command = ["bun", join(root, "packages/pipeline/scripts/run-manga-ocr.ts")];
  if (options.sourceDir) command.push("--root", options.sourceDir);
  if (options.lotId) command.push("--lot", options.lotId);
  if (options.concurrency !== undefined) command.push("--limit", String(options.concurrency));
  if (options.dryRun) command.push("--dry-run");
  return executeCommand(command, { cwd: root, dryRun: options.dryRun, runner: options.runner });
}

export async function runDatabooksOcr(options: OcrJobOptions = {}): Promise<PipelineExecution> {
  const root = join(import.meta.dir, "../../..");
  if (options.lotId) throw new Error("Le worker databooks continu ne prend pas de lotId");
  const command = ["bun", join(root, "scripts/ops/gpu-continuous-ocr.ts")];
  if (options.concurrency !== undefined) command.push("--limite-lots", String(options.concurrency));
  return executeCommand(command, { cwd: root, dryRun: options.dryRun, runner: options.runner });
}

/**
 * E5 constants of the RAG index, read from `@aphrody/shenron-ai/config` (single
 * source: `aphrody-shenron-embed` model, 384 dimensions, 16 inputs per call).
 */
export const RAG_EMBED_MODEL: string = SHENRON_E5.modelId;
export const RAG_EMBED_DIMENSIONS: number = SHENRON_E5.dimensions;
export const RAG_EMBED_MAX_INPUTS: number = SHENRON_E5.maxInputs;

export interface RagBuildOptions {
  source?: "manga" | "databooks" | "wiki" | "all";
  dryRun?: boolean;
  runner?: CommandRunner;
}

export interface RagSearchResultItem {
  title: string;
  snippet: string;
  score: number;
  kind?: string;
  url?: string;
}

export async function buildRagIndex(options: RagBuildOptions = {}): Promise<PipelineExecution> {
  if (options.source && options.source !== "all")
    throw new Error("source ciblée: utilisez rag-resync-entites");
  const root = join(import.meta.dir, "../../..");
  return executeCommand(
    [
      "bun",
      join(root, "packages/pipeline/scripts/rag-sync-aphrody.ts"),
      "--toutes",
      ...(options.dryRun ? [] : ["--appliquer"]),
    ],
    {
      cwd: root,
      dryRun: options.dryRun,
      runner: options.runner,
    },
  );
}

export async function searchRagIndex(query: string, limit = 5): Promise<RagSearchResultItem[]> {
  return new AphrodyComputeClient().ragSearch(query, limit);
}

export async function evaluateRag(
  options: { dryRun?: boolean; runner?: CommandRunner } = {},
): Promise<PipelineExecution> {
  const root = join(import.meta.dir, "../../..");
  return executeCommand(["bun", join(root, "scripts/ops/eval-aphrody-rag.ts"), "--ci"], {
    cwd: root,
    dryRun: options.dryRun,
    runner: options.runner,
  });
}

export interface CrawlTarget {
  source:
    | "dragonballcn"
    | "kanzenshuu"
    | "official"
    | "databooks"
    | "guides"
    | "custom"
    | "universal";
  url?: string;
  depth?: number;
  outDir?: string;
  maxRequests?: number;
  dryRun?: boolean;
  runner?: CommandRunner;
}

/** Canonical Aphrody Web campaign identifiers selected by Shenron's source catalog. */
export const CRAWL_SOURCE_IDS: Readonly<
  Partial<Record<Exclude<CrawlTarget["source"], "custom" | "universal">, string>>
> = Object.freeze({
  dragonballcn: "dragonballcn",
  kanzenshuu: "kanzenshuu",
  official: "official",
  databooks: "kanzentai,neoseeker-databooks,databook-other",
  guides: "guides",
});

/**
 * Builds the native web-pipeline arguments for a remote Aphrody Jobs worker.
 * Output/state paths stay on the worker host; callers pass only catalogued sources,
 * URL seeds and bounded request parameters through the authenticated queue.
 */
export function createCrawlJobArgs(target: CrawlTarget): string[] {
  if (target.outDir !== undefined)
    throw new Error("Remote crawl output and state paths are owned by the worker host");
  if (target.url && target.source !== "custom")
    throw new Error("A seed URL requires the custom crawl source");
  for (const value of [target.depth, target.maxRequests])
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
      throw new RangeError("Crawl budgets must be non-negative safe integers");
  if (target.maxRequests === 0) throw new RangeError("maxRequests must be positive");

  if (target.source === "custom") {
    if (!target.url) throw new Error("crawl custom requires a URL");
    const url = new URL(target.url);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      throw new Error("crawl custom requires an HTTP(S) URL without credentials");
    if (url.hostname === "fandom.com" || url.hostname.endsWith(".fandom.com"))
      throw new Error("Fandom is not an allowed Dragon Ball source");
    const slug = url.hostname
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32);
    const digest = new Bun.CryptoHasher("sha256").update(url.href).digest("hex").slice(0, 12);
    const args = [
      "crawl-index",
      url.href,
      "--label",
      `shenron-custom-${slug}-${digest}`,
      "--profile",
      "shenron",
    ];
    args.push("--max-requests", String(target.maxRequests ?? 500));
    args.push("--max-depth", String(target.depth ?? 2));
    return args;
  }

  if (target.source !== "universal" && !Object.hasOwn(CRAWL_SOURCE_IDS, target.source))
    throw new Error(`Unknown Dragon Ball crawl source: ${target.source}`);
  const args = ["dragon-ball", "crawl", "--profile", "shenron"];
  if (target.source !== "universal")
    args.push("--source", CRAWL_SOURCE_IDS[target.source as keyof typeof CRAWL_SOURCE_IDS]!);
  args.push("--browser", "playwright");
  args.push("--max-requests", String(target.maxRequests ?? 500));
  if (target.depth !== undefined) args.push("--max-depth", String(target.depth));
  args.push("--render", "--json", "--index");
  return args;
}

/** Creates the idempotent queue intent consumed by `AphrodyWebJobs.submit`. */
export function createCrawlJobIntent(key: string, target: CrawlTarget): WebJobIntent {
  const args = createCrawlJobArgs(target);
  if (target.source !== "custom") {
    const budgetIndex = args.indexOf("--max-requests");
    args.splice(budgetIndex, 0, "--output", crawlJobOutputDirectory(key));
  }
  return { key, args, maxAttempts: 1 };
}

/**
 * Aphrody-owned Dragon Ball crawl and RAG locations for the Shenron profile.
 */
export function corpusLocations(_root: string, env?: Record<string, string | undefined>) {
  env ??= process.env;
  const crawlDir =
    env.APHRODY_CORPUS_CRAWL_DIR?.trim() ||
    join(env.APHRODY_HOME?.trim() || join(homedir(), ".aphrody"), "workspaces", "dbfr", "crawl");
  return {
    crawlDir,
    corpusDir: join(crawlDir, "corpus"),
    profile: "shenron",
  };
}

/** Ingests every Aphrody Web corpus JSONL export into the Aphrody RAG owner. */
export async function runCorpusIngest(
  options: { dryRun?: boolean; outDir?: string; runner?: CommandRunner } = {},
): Promise<PipelineExecution> {
  const root = join(import.meta.dir, "../../..");
  const loc = corpusLocations(root);
  const command = [
    process.env.APHRODY_BIN?.trim() || "aphrody",
    "web",
    "dragon-ball",
    "index",
    "--output",
    options.outDir ?? loc.corpusDir,
    "--profile",
    loc.profile,
    "--json",
  ];
  return executeCommand(command, { cwd: root, dryRun: options.dryRun, runner: options.runner });
}

export async function runCrawl(target: CrawlTarget): Promise<PipelineExecution> {
  const root = join(import.meta.dir, "../../..");
  const loc = corpusLocations(root);
  const bin = process.env.APHRODY_BIN?.trim() || "aphrody";
  if (target.url && target.source !== "custom")
    throw new Error("A seed URL requires the custom crawl source");
  if (target.outDir !== undefined && !target.outDir.trim())
    throw new Error("The crawl output directory must not be empty");
  const sources = CRAWL_SOURCE_IDS;
  let command: string[];
  if (target.source === "custom") {
    if (!target.url) throw new Error("crawl custom exige une URL");
    const url = new URL(target.url);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      throw new Error("crawl custom requires an HTTP(S) URL without credentials");
    if (url.hostname === "fandom.com" || url.hostname.endsWith(".fandom.com"))
      throw new Error("Fandom is not an allowed Dragon Ball source");
    command = [
      bin,
      "web",
      "crawl-index",
      url.href,
      "--label",
      "shenron-custom",
      "--profile",
      loc.profile,
    ];
    if (target.outDir) command.push("--state", target.outDir);
  } else {
    if (target.source !== "universal" && !Object.hasOwn(sources, target.source))
      throw new Error(`Unknown Dragon Ball crawl source: ${target.source}`);
    command = [
      bin,
      "web",
      "dragon-ball",
      "crawl",
      "--output",
      target.outDir ?? loc.corpusDir,
      "--profile",
      loc.profile,
      "--json",
      "--index",
    ];
    if (target.source !== "universal")
      command.push("--source", sources[target.source as keyof typeof sources]!);
    if (process.env.APHRODY_CORPUS_CRAWL_CONFIG?.trim())
      command.push("--config", process.env.APHRODY_CORPUS_CRAWL_CONFIG.trim());
  }
  for (const value of [target.depth, target.maxRequests])
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
      throw new RangeError("Crawl budgets must be non-negative safe integers");
  if (target.maxRequests === 0) throw new RangeError("maxRequests must be positive");
  command.push("--max-requests", String(target.maxRequests ?? 500));
  if (target.depth !== undefined) command.push("--max-depth", String(target.depth));
  return executeCommand(command, { cwd: root, dryRun: target.dryRun, runner: target.runner });
}
export * from "./dragonballcn-gallery";

/**
 * Unified Bun entrypoint for the repository translation pipeline.
 * The supervisor owns sharding, BXC startup, quality gates, atomic deposits,
 * RAG ingestion and run evidence; this package only provides the stable CLI.
 */

export interface TranslationOptions {
  dryRun?: boolean;
  args?: string[];
}

export async function runTranslation(
  options: TranslationOptions = {},
): Promise<Record<string, unknown>> {
  const args = options.args ?? [];
  const root = join(import.meta.dir, "../../..");
  const supervisor = join(root, "apps/site/scripts/traduction-boucle.ts");
  if (options.dryRun) {
    return {
      status: "planned",
      entrypoint: supervisor,
      scope:
        "eligible databook pages -> Aphrody Rust translation -> Shenron editorial gate and deposit",
    };
  }

  const child = Bun.spawn(
    [process.execPath, supervisor, ...args.filter((arg) => arg !== "--dry-run")],
    { cwd: root, stdout: "inherit", stderr: "inherit", stdin: "inherit" },
  );
  const code = await child.exited;
  if (code !== 0) throw new Error(`translation worker exited with code ${code}`);
  return { status: "completed", supervisor };
}
