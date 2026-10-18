// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { code } from "bun:yolo";
import { runAuto } from "../../src/auto";
import { probeCapabilities } from "../../src/auto/capabilities";
import { hostAllowed } from "../../src/auto/crawl";
import { runDrafts, type DraftRunner } from "../../src/auto/workers";

const body = "Goku est un Saiyan élevé sur Terre. ".repeat(6);
const page = (links = "") =>
  `<html><head><title>Goku</title></head><body><nav>menu</nav><p>${body}</p>${links}<script>x()</script></body></html>`;

test("host allowlist refuses Fandom and unlisted hosts", () => {
  expect(hostAllowed(new URL("https://dragonballfr.com/a"), ["dragonballfr.com"])).toBe(true);
  expect(hostAllowed(new URL("https://x.fandom.com/a"), ["fandom.com"])).toBe(false);
  expect(hostAllowed(new URL("https://evil.test/a"), ["dragonballfr.com"])).toBe(false);
});

test("capability probe never throws and reports booleans", async () => {
  const caps = await probeCapabilities({ vpnTimeoutMs: 500 });
  expect(typeof caps.fetchSession).toBe("boolean");
  expect(["connected", "down", "unavailable"]).toContain(caps.vpn);
});

test("worker pool bounds concurrency per runner and records failures", async () => {
  let active = 0;
  let peak = 0;
  const runner: DraftRunner = {
    id: "r",
    model: "m",
    host: "local",
    slots: 2,
    async draft(task) {
      active++;
      peak = Math.max(peak, active);
      await Bun.sleep(5);
      active--;
      if (task.id === "bad") throw new Error("boom");
      return `text ${task.id}`;
    },
  };
  const tasks = ["a", "b", "c", "bad"].map((id) => ({ id, title: id, evidence: [] }));
  const { drafts, failures } = await runDrafts(tasks, [runner]);
  expect(peak).toBeLessThanOrEqual(2);
  expect(drafts).toHaveLength(3);
  expect(failures[0]!.taskId).toBe("bad");
});

test("crawl, two-model drafts and bun:yolo arbitration yield review-only candidates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auto-"));
  try {
    const fetcher = async (url: string) => {
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /secret");
      if (url.includes("/secret")) throw new Error("must not be fetched");
      return new Response(
        page(
          url.endsWith("/start")
            ? '<a href="/secret">s</a><a href="https://x.fandom.com/y">f</a>'
            : "",
        ),
        { headers: { "content-type": "text/html" } },
      );
    };
    const make = (id: string): DraftRunner => ({
      id,
      model: id,
      host: id === "b" ? "dbfr" : "local",
      slots: 2,
      draft: async (task) => `notice ${id} ${task.title}`,
    });
    const provider = code(() => ({
      model: "fixture",
      usage: null,
      answers: {
        better: {
          type: "choice" as const,
          choice: "b",
          confidence: 1,
          probabilities: { a: 0, b: 1 },
        },
      },
    }));
    const report = await runAuto({
      seeds: ["https://dragonballfr.com/start"],
      allowHosts: ["dragonballfr.com"],
      out: dir,
      runners: [make("a"), make("b")],
      provider,
      fetcher,
      capabilities: {
        fetchSession: true,
        nativeCrawl: false,
        webView: false,
        vectorIndex: false,
        adblock: false,
        yolo: true,
        vpn: "unavailable",
      },
    });
    expect(report.crawl.pages).toBe(1);
    expect(report.ingestion).toBe("passages-jsonl");
    expect(report.verdicts.arbitrated).toBe(1);
    const row = JSON.parse((await Bun.file(report.review).text()).trim());
    expect(row.reviewOnly).toBe(true);
    expect(row.winner).toBe("b");
    expect(row.candidates).toHaveLength(2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
