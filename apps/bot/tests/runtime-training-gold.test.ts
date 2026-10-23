import "./setup-training";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CronRegistry } from "../src/api/cron-registry";
import { DatabaseService } from "../src/db/index";
import { AutoEvalCronEvent } from "../src/events/AutoEvalCron";
import { logger } from "../src/lib/logger";
import { CanonService } from "../src/services/CanonService";
import { TrainingService } from "../src/services/TrainingService";

const dir = mkdtempSync(join(tmpdir(), "shenron-gold-"));
const saved = { path: process.env.RAG_GOLD_PATH, legacy: process.env.RAG_GOLD };

beforeEach(() => {
  delete process.env.RAG_GOLD;
  delete process.env.RAG_GOLD_PATH;
});
afterEach(() => {
  if (saved.path === undefined) delete process.env.RAG_GOLD_PATH;
  else process.env.RAG_GOLD_PATH = saved.path;
  if (saved.legacy === undefined) delete process.env.RAG_GOLD;
  else process.env.RAG_GOLD = saved.legacy;
});

const dbs = new DatabaseService();
const training = () => new TrainingService(dbs, new CanonService(null as never));
const historyRows = () =>
  (dbs.sqlite.query("SELECT COUNT(*) n FROM rag_eval_history").get() as { n: number }).n;

describe("gold set availability", () => {
  test("a configured path that does not exist falls back to the embedded set, never to nothing", async () => {
    process.env.RAG_GOLD_PATH = join(dir, "absent", "gold.jsonl");
    const cases = await training().loadGoldCases();
    // The shipped file has 170+ questions; the production bug was exactly 0.
    expect(cases.length).toBeGreaterThan(100);
    expect(cases.every((c) => c.q.length > 0)).toBe(true);
  });

  test("a configured file that exists is authoritative, even when short", async () => {
    const file = join(dir, "custom.jsonl");
    await Bun.write(file, JSON.stringify({ q: "Qui est Goku ?", expect: ["Son Goku"] }) + "\n");
    process.env.RAG_GOLD_PATH = file;
    expect((await training().loadGoldCases()).map((c) => c.q)).toEqual(["Qui est Goku ?"]);
  });

  test("adding a case to an absent file keeps the embedded cases instead of starting from zero", async () => {
    const file = join(dir, "new-dir", "gold.jsonl");
    process.env.RAG_GOLD_PATH = file;
    expect(
      await training().addGoldCase("Une question inédite sur les Saiyens ?", ["Saiyens"]),
    ).toBe(true);
    const cases = await training().loadGoldCases();
    expect(cases.length).toBeGreaterThan(100);
    expect(cases.at(-1)?.q).toBe("Une question inédite sur les Saiyens ?");
  });
});

describe("an empty gold set is reported, not recorded", () => {
  test("evaluateRag warns and writes no history row", async () => {
    const file = join(dir, "empty.jsonl");
    await Bun.write(file, "");
    process.env.RAG_GOLD_PATH = file;
    const warn = spyOn(logger, "warn");
    const before = historyRows();
    try {
      const metrics = await training().evaluateRag(25);
      expect(metrics.cases).toBe(0);
      expect(historyRows()).toBe(before);
      expect(warn.mock.calls.some((call) => String(call[0]).includes("gold set is empty"))).toBe(
        true,
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("the cron does not log a success for zero cases", async () => {
    const cron = new CronRegistry();
    const service = training();
    (service as unknown as { evaluateRag: unknown }).evaluateRag = async () => ({
      cases: 0,
      recall: {},
      mrr: 0,
      ndcg: 0,
      durationMs: 1,
      sidecarActive: true,
      misses: [],
    });
    const info = spyOn(logger, "info");
    const warn = spyOn(logger, "warn");
    try {
      await new AutoEvalCronEvent(cron, service).register();
      const result = await cron.run("rag-auto-eval");
      expect(result.ok).toBe(true);
      const messages = (spy: typeof info) => spy.mock.calls.map((call) => String(call.at(-1)));
      expect(messages(info).some((m) => m.includes("terminée avec succès"))).toBe(false);
      expect(messages(warn).some((m) => m.includes("Aucun cas évalué"))).toBe(true);
    } finally {
      info.mockRestore();
      warn.mockRestore();
    }
  });
});
