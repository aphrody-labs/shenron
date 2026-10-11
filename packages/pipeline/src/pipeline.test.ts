import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeCommand, type CommandRunner } from "./execution";
import { runMangaOcr, runDatabooksOcr } from "./workflows";
import { buildRagIndex, evaluateRag } from "./workflows";
import { runIaTask, getToriyamaPersona } from "./workflows";
import { runCrawl, runCorpusIngest } from "./workflows";

const okRunner: CommandRunner = async (command) => ({
  code: 0,
  stdout: JSON.stringify({ command }),
  stderr: "",
});
const originalProfileHome = process.env.APHRODY_PROFILE_HOME;

afterEach(() => {
  if (originalProfileHome === undefined) delete process.env.APHRODY_PROFILE_HOME;
  else process.env.APHRODY_PROFILE_HOME = originalProfileHome;
});

describe("@aphrody/shenron-pipeline — exécution vérifiable", () => {
  it("planifie un dry-run sans exécuter le runner", async () => {
    let called = false;
    const result = await buildRagIndex({
      dryRun: true,
      runner: async () => {
        called = true;
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    expect(result.status).toBe("planned");
    expect(called).toBe(false);
  });

  it("synchronise toutes les sources vers Aphrody par défaut", async () => {
    const result = await buildRagIndex({ runner: okRunner });
    expect(result.command.at(1)?.endsWith("rag-sync-aphrody.ts")).toBe(true);
    expect(result.command).toContain("--toutes");
    expect(result.command).toContain("--appliquer");
  });

  it("propage les échecs de commande avec leur diagnostic", async () => {
    await expect(
      executeCommand(["outil", "arg"], {
        cwd: process.cwd(),
        runner: async () => ({ code: 7, stdout: "", stderr: "échec fixture" }),
      }),
    ).rejects.toThrow("échec fixture");
  });

  it("route le crawl vers le propriétaire natif sans changer les autres pipelines", async () => {
    const manga = await runMangaOcr({ runner: okRunner });
    const databooks = await runDatabooksOcr({ runner: okRunner });
    const rag = await evaluateRag({ runner: okRunner });
    const crawl = await runCrawl({ source: "kanzenshuu", runner: okRunner });
    const officialCrawl = await runCrawl({ source: "official", runner: okRunner });
    const remoteCrawl = await runCrawl({
      source: "custom",
      url: "https://example.org/news",
      runner: okRunner,
    });
    expect(manga.command.at(1)?.endsWith("run-manga-ocr.ts")).toBe(true);
    expect(databooks.command.at(1)?.endsWith("gpu-continuous-ocr.ts")).toBe(true);
    expect(rag.command.at(1)?.endsWith("eval-aphrody-rag.ts")).toBe(true);
    expect(rag.command).toContain("--ci");
    expect(crawl.command.slice(1, 4)).toEqual(["web", "dragon-ball", "crawl"]);
    expect(crawl.command).toContain("kanzenshuu");
    expect(officialCrawl.command).toContain("official");
    expect(remoteCrawl.command.slice(1, 4)).toEqual([
      "web",
      "crawl-index",
      "https://example.org/news",
    ]);
    for (const result of [crawl, officialCrawl, remoteCrawl]) {
      expect(result.command[result.command.indexOf("--profile") + 1]).toBe("shenron");
      expect(result.command.some((arg) => arg.endsWith(".ts"))).toBe(false);
    }
  });

  it("refuse les sources interdites et les budgets invalides avant toute exécution", async () => {
    const runner: CommandRunner = async () => {
      throw new Error("must not execute");
    };
    for (const url of [
      "https://dragonball.fandom.com/wiki/Goku",
      "https://user:secret@example.org",
      "file:///tmp/private",
    ]) {
      await expect(runCrawl({ source: "custom", url, runner })).rejects.toThrow();
    }
    for (const maxRequests of [0, -1, Number.NaN, 1.5]) {
      await expect(runCrawl({ source: "official", maxRequests, runner })).rejects.toThrow();
    }
  });

  it("planifie sans lancer le crawler et indexe les exports dans le profil Shenron", async () => {
    const planned = await runCrawl({
      source: "universal",
      dryRun: true,
      runner: async () => {
        throw new Error("must not execute");
      },
    });
    expect(planned.status).toBe("planned");
    expect(planned.command).toContain("--index");
    const result = await runCorpusIngest({ runner: okRunner });
    expect(result.command.slice(1, 4)).toEqual(["web", "dragon-ball", "index"]);
    expect(result.command[result.command.indexOf("--profile") + 1]).toBe("shenron");
  });

  it("retourne uniquement la sortie réelle de l'agent", async () => {
    const response = await runIaTask({
      task: "vérifier le canon",
      withRag: false,
      chat: async () => ({ answer: "réponse fixture", model: "fixture" }),
    });
    expect(response.content).toBe("réponse fixture");
    await expect(
      runIaTask({
        task: "échec",
        withRag: false,
        chat: async () => {
          throw new Error("backend indisponible");
        },
      }),
    ).rejects.toThrow("backend indisponible");
  });

  it("exige les fichiers réels du profil éditorial", () => {
    const root = join(tmpdir(), `shenron-profile-${process.pid}-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    // Explicit environment: the ambient agent session (APHRODY_AGENT_DOMAIN…) must not leak in.
    const env = { APHRODY_PROFILE_HOME: root };
    expect(() => getToriyamaPersona(env)).toThrow("Profil Shenron incomplet");
    writeFileSync(join(root, "SOUL.md"), "soul fixture");
    writeFileSync(join(root, "IDENTITY.md"), "identity fixture");
    expect(getToriyamaPersona(env)).toEqual({ soul: "soul fixture", identity: "identity fixture" });
    rmSync(root, { recursive: true, force: true });
  });
});
