// SPDX-License-Identifier: Apache-2.0
/**
 * Automated chain: crawl -> passages (RAG ingestion input) -> concurrent wiki drafts by two
 * models -> bun:yolo arbitration. Output is review-only JSONL; no database is ever written.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Provider } from "bun:yolo";
import { arbitrate, type Verdict } from "./arbiter";
import { probeCapabilities, type Capabilities } from "./capabilities";
import { crawl, type CrawlPassage, type CrawlResult } from "./crawl";
import { runDrafts, type Draft, type DraftRunner, type DraftTask } from "./workers";

export interface AutoOptions {
  seeds: readonly string[];
  allowHosts: readonly string[];
  out: string;
  maxPages?: number;
  runners: readonly DraftRunner[];
  provider: Provider | null;
  fetcher?: Parameters<typeof crawl>[0]["fetcher"];
  capabilities?: Capabilities;
  log?: (line: string) => void;
}

export interface AutoReport {
  capabilities: Capabilities;
  crawl: Pick<CrawlResult, "pages" | "passages"> & { skipped: number };
  ingestion: "vector-index" | "passages-jsonl";
  drafts: number;
  failures: number;
  verdicts: Record<Verdict["status"], number>;
  review: string;
}

export async function runAuto(options: AutoOptions): Promise<AutoReport> {
  const log = options.log ?? (() => {});
  const capabilities = options.capabilities ?? (await probeCapabilities());
  await mkdir(options.out, { recursive: true });
  const crawled = await crawl({
    seeds: options.seeds,
    allowHosts: options.allowHosts,
    store: join(options.out, "crawl"),
    maxPages: options.maxPages,
    fetcher: options.fetcher,
  });
  log(`crawl: ${crawled.pages} pages, ${crawled.skipped.length} skipped`);
  const passages = (await Bun.file(crawled.passages).text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CrawlPassage);
  // Index capability only selects the ingestion target; `rag:build` stays an explicit step.
  const ingestion = capabilities.vectorIndex ? "vector-index" : "passages-jsonl";

  const tasks: DraftTask[] = passages
    .filter((p) => p.text.length > 80)
    .map((p) => ({
      id: p.sha256,
      title: p.title || p.url,
      evidence: [{ id: p.sha256, excerpt: p.text.slice(0, 1500), url: p.url }],
    }));
  const { drafts, failures } = await runDrafts(tasks, options.runners);
  log(`drafts: ${drafts.length}, failures: ${failures.length}`);

  const verdicts: Verdict[] = [];
  for (const task of tasks) {
    const mine = drafts.filter((d) => d.taskId === task.id);
    verdicts.push(
      mine.length > 1 && !options.provider
        ? { taskId: task.id, winner: null, status: "abstained", confidence: null }
        : await arbitrate(task, drafts, {
            provider: options.provider ?? (undefined as never),
          }).catch(() => ({
            taskId: task.id,
            winner: null,
            status: "abstained" as const,
            confidence: null,
          })),
    );
  }
  const review = join(options.out, "wiki-candidates.jsonl");
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const lines = verdicts.map((v) => {
    const task = byId.get(v.taskId)!;
    const candidates: Draft[] = drafts.filter((d) => d.taskId === v.taskId);
    return JSON.stringify({
      schema: "shenron-wiki-candidate/v1",
      reviewOnly: true,
      title: task.title,
      source: task.evidence[0]!.url,
      status: v.status,
      confidence: v.confidence,
      winner: v.winner?.runner ?? null,
      text: v.winner?.text ?? null,
      candidates: candidates.map(({ runner, model, host, latencyMs, text }) => ({
        runner,
        model,
        host,
        latencyMs,
        text,
      })),
    });
  });
  await Bun.write(review, lines.length ? `${lines.join("\n")}\n` : "");
  const tally = { arbitrated: 0, single: 0, abstained: 0, none: 0 };
  for (const v of verdicts) tally[v.status]++;
  const report: AutoReport = {
    capabilities,
    crawl: { pages: crawled.pages, passages: crawled.passages, skipped: crawled.skipped.length },
    ingestion,
    drafts: drafts.length,
    failures: failures.length,
    verdicts: tally,
    review,
  };
  await Bun.write(join(options.out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
